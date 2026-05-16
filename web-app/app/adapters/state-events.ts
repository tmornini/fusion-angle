import type {
    Id, IdeaState, ProjectState, StateEntity,
    WorkerState,
} from '../../../api/types.ts';
import {
    assertIdeaState,
    assertProjectState,
    assertWorkerState,
    isIdeaState,
    isProjectState,
    isWorkerState,
    msSinceUtc,
    MS_PER_SECOND,
    nowUtc,
} from '../../../api/types.ts';
import type { RequestContext, WriteOp } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    getCurrentHumanWorker,
} from './workers.ts';

// Constructs a single PUT op against the states table —
// the atomic seam between an entity-lifecycle adapter and
// the append-only event log. Composed at the call site
// with sibling ops inside one ctx.commit batch — every op
// lands as one transaction. The current human worker is
// the actor; nowUtc the moment. Caller does NOT pre-
// resolve the worker — the helper owns that read so every
// site speaks the same vocabulary.
export async function buildStateEventOp(
    ctx: RequestContext,
    entityId: Id,
    state: string,
): Promise<WriteOp> {
    const worker = await getCurrentHumanWorker(ctx);
    const eventId = generateCryptoSafeBase62();
    return {
        method: 'put',
        resource: `states/${eventId}`,
        body: {
            entity_id: entityId,
            state,
            worker_id: worker.id,
            at: nowUtc(),
        },
    };
}

// The closed claim vocabulary. Three strings: a claim
// either exists ('claimed'), is voluntarily relinquished
// ('claim_released'), or is forcibly superseded by a
// newer claim ('claim_expired'). Every other state
// string on a work_order entity_id is a node id
// recording a transition. The byte-level split between
// the two families is unambiguous: claim strings are
// snake-cased English, node ids are base62 tokens.
const CLAIM_STATES = new Set([
    'claimed',
    'claim_released',
    'claim_expired',
]);

function isClaimState(state: string): boolean {
    return CLAIM_STATES.has(state);
}

function latestByAt(
    events: readonly StateEntity[],
): StateEntity | null {
    let latest: StateEntity | null = null;
    for (const ev of events) {
        if (latest === null || ev.at >= latest.at) {
            latest = ev;
        }
    }
    return latest;
}

// A transition event in the shape flow-stats-aggregate
// and the workbox detail presenter expect. Derived
// from the states log: each non-claim event for a
// work order is a transition into state=to_node_id;
// from_node_id is the prior event's state, '' for the
// very first event (matching the creation-transition
// convention). The id is the underlying state event's
// id — the foreign-key target for state_field_values.
export interface TransitionEvent {
    id: Id;
    work_order_id: Id;
    from_node_id: Id;
    to_node_id: Id;
    worker_id: Id;
    at: string;
}

// Returns the work order's current node id — the
// state of the latest non-claim event for
// entity_id = workOrderId, or null if no
// transitions have been recorded.
export async function getWorkOrderCurrentNodeId(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<Id | null> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${workOrderId}/history`,
    );
    const transitions = events.filter(
        ev => !isClaimState(ev.state),
    );
    const latest = latestByAt(transitions);
    return latest === null ? null : latest.state;
}

// Returns the worker holding the active claim and
// the moment they took it — or null if no claim is
// live. A 'claimed' event older than lockTimeout is
// implicitly expired and reads as null even if no
// 'claim_expired' / 'claim_released' event has yet
// superseded it. The materialized 'claim_expired'
// event (written by postWorkOrderClaim when a new
// claim notices a stale prior) is the durable
// record of the same condition; the two are
// consistent.
export async function getWorkOrderActiveClaim(
    ctx: RequestContext,
    workOrderId: Id,
    lockTimeout: number,
): Promise<{ workerId: Id; at: string } | null> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${workOrderId}/history`,
    );
    const claims = events.filter(
        ev => isClaimState(ev.state),
    );
    const latest = latestByAt(claims);
    if (latest === null || latest.state !== 'claimed') {
        return null;
    }
    const elapsedMs = msSinceUtc(latest.at);
    if (elapsedMs >= lockTimeout * MS_PER_SECOND) {
        return null;
    }
    return { workerId: latest.worker_id, at: latest.at };
}

// Project the non-claim events for one work order into
// the TransitionEvent shape consumed by the workbox
// detail presenter and (via the bulk variant below)
// flow-stats-aggregate. The first event carries
// from_node_id='' — the existing convention for
// creation transitions.
function projectTransitions(
    workOrderId: Id,
    events: readonly StateEntity[],
): TransitionEvent[] {
    const transitions = events
        .filter(ev => !isClaimState(ev.state))
        .toSorted((a, b) => a.at.localeCompare(b.at));
    const out: TransitionEvent[] = [];
    let prior = '';
    for (const ev of transitions) {
        out.push({
            id: ev.id,
            work_order_id: workOrderId,
            from_node_id: prior,
            to_node_id: ev.state,
            worker_id: ev.worker_id,
            at: ev.at,
        });
        prior = ev.state;
    }
    return out;
}

// Returns the ordered transition history for one work
// order, in the shape the workbox detail presenter
// consumes. Read-once per work-order detail page load.
export async function getWorkOrderTransitionEvents(
    ctx: RequestContext,
    workOrderId: Id,
): Promise<TransitionEvent[]> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${workOrderId}/history`,
    );
    return projectTransitions(workOrderId, events);
}

// Bulk variant for flow-stats-aggregate, which needs
// the transition history for every work order on a
// flow at once. One GET against /states scans the log,
// then per-entity grouping + projection happens in JS.
// O(N) on events; Postgres will use an index on
// entity_id.
export async function getTransitionEventsByWorkOrder(
    ctx: RequestContext,
): Promise<Map<Id, TransitionEvent[]>> {
    const all = await ctx.GET<StateEntity[]>('states');
    const byEntity = new Map<Id, StateEntity[]>();
    for (const ev of all) {
        if (isClaimState(ev.state)) continue;
        const list = byEntity.get(ev.entity_id);
        if (list) {
            list.push(ev);
        } else {
            byEntity.set(ev.entity_id, [ev]);
        }
    }
    const out = new Map<Id, TransitionEvent[]>();
    for (const [entityId, events] of byEntity) {
        out.set(
            entityId,
            projectTransitions(entityId, events),
        );
    }
    return out;
}

// Read the current state for one idea from the
// states log. Returns the validated IdeaState (the
// composite alphabet). Throws when no event has
// been recorded — every idea created through the
// supported paths gets an initial 'active:*' event,
// so absence is a bug, not a missing default.
export async function getIdeaState(
    ctx: RequestContext,
    ideaId: Id,
): Promise<IdeaState> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${ideaId}/history`,
    );
    const latest = latestByAt(events);
    if (latest === null) {
        throw new Error(
            'no state event for idea ' + ideaId,
        );
    }
    return assertIdeaState(
        latest.state, 'idea ' + ideaId,
    );
}

// Bulk variant for getIdeas. One scan over the
// states log builds the entity_id → IdeaState map,
// keeping only events whose state lies in the idea
// alphabet (a work order's transition events share
// the table). O(N) on events; the Postgres tier will
// use an entity_id index.
export async function getIdeaStates(
    ctx: RequestContext,
): Promise<Map<Id, IdeaState>> {
    const all = await ctx.GET<StateEntity[]>('states');
    const latestByEntity = new Map<Id, StateEntity>();
    for (const ev of all) {
        if (!isIdeaState(ev.state)) continue;
        const seen = latestByEntity.get(ev.entity_id);
        if (seen === undefined || ev.at >= seen.at) {
            latestByEntity.set(ev.entity_id, ev);
        }
    }
    const out = new Map<Id, IdeaState>();
    for (const [id, ev] of latestByEntity) {
        out.set(id, ev.state as IdeaState);
    }
    return out;
}

// Read the current state for one project from the
// states log. Returns the validated ProjectState.
// Throws when no event has been recorded — every
// project created through the supported paths gets
// an initial 'submitted' event (or whichever the
// supporting flow specifies), so absence is a bug,
// not a missing default.
export async function getProjectState(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectState> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${projectId}/history`,
    );
    const latest = latestByAt(events);
    if (latest === null) {
        throw new Error(
            'no state event for project ' + projectId,
        );
    }
    return assertProjectState(
        latest.state, 'project ' + projectId,
    );
}

// Bulk variant for getProjects. One scan over the
// states log builds the entity_id → ProjectState
// map, keeping only events whose state lies in the
// project alphabet. O(N) on events; Postgres uses
// an entity_id index.
export async function getProjectStates(
    ctx: RequestContext,
): Promise<Map<Id, ProjectState>> {
    const all = await ctx.GET<StateEntity[]>('states');
    const latestByEntity = new Map<Id, StateEntity>();
    for (const ev of all) {
        if (!isProjectState(ev.state)) continue;
        const seen = latestByEntity.get(ev.entity_id);
        if (seen === undefined || ev.at >= seen.at) {
            latestByEntity.set(ev.entity_id, ev);
        }
    }
    const out = new Map<Id, ProjectState>();
    for (const [id, ev] of latestByEntity) {
        out.set(id, ev.state as ProjectState);
    }
    return out;
}

// Read the current state for one worker from the
// states log. Returns the validated WorkerState.
// Throws when no event has been recorded — every
// worker created through the supported paths gets
// an initial state event, so absence is a bug,
// not a missing default. The worker id is unique
// across the human and AI tables — both produce
// base62 ids from the same generator — so this
// reader serves both kinds without discrimination.
export async function getWorkerState(
    ctx: RequestContext,
    workerId: Id,
): Promise<WorkerState> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${workerId}/history`,
    );
    const latest = latestByAt(events);
    if (latest === null) {
        throw new Error(
            'no state event for worker ' + workerId,
        );
    }
    return assertWorkerState(
        latest.state, 'worker ' + workerId,
    );
}

// Bulk variant for getHumanWorkers / getAIWorkers.
// One scan over the states log builds the
// entity_id → WorkerState map, keeping only events
// whose state lies in the worker alphabet (work
// order claims and transitions share the table).
// O(N) on events; Postgres uses an entity_id index.
export async function getWorkerStates(
    ctx: RequestContext,
): Promise<Map<Id, WorkerState>> {
    const all = await ctx.GET<StateEntity[]>('states');
    const latestByEntity = new Map<Id, StateEntity>();
    for (const ev of all) {
        if (!isWorkerState(ev.state)) continue;
        const seen = latestByEntity.get(ev.entity_id);
        if (seen === undefined || ev.at >= seen.at) {
            latestByEntity.set(ev.entity_id, ev);
        }
    }
    const out = new Map<Id, WorkerState>();
    for (const [id, ev] of latestByEntity) {
        out.set(id, ev.state as WorkerState);
    }
    return out;
}
