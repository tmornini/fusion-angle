import type {
    Id, IdeaEntity, IdeaState, ProjectEntity,
    ProjectState, RecordEntity, RecordState,
    StateEntity, MemberEntity, MemberState,
} from '../../../api/types.ts';
import {
    assertIdeaState,
    assertProjectState,
    assertMemberState,
    msSinceUtc,
    MS_PER_SECOND,
    nowUtc,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    latestByKey,
} from '../../../api/ledger-reduction.ts';
import {
    isClaimState,
} from '../../../api/work-order-claims.ts';

// A single state transition is one idempotent row — write it
// straight to PUT /states/:id. The author is stamped server-
// side from the verified token, so the body carries no
// member_id; nowUtc stamps the moment. The client mints the
// event id (retries hit one row).
export async function postStateEvent(
    ctx: RequestContext,
    entityId: Id,
    state: string,
): Promise<void> {
    const eventId = generateCryptoSafeBase62();
    await ctx.PUT(`states/${eventId}`, {
        entity_id: entityId,
        state,
        at: nowUtc(),
    });
}

// The states log is shared across entity types and the
// alphabets overlap ('active', 'archived', 'approved',
// 'sent_back', 'deleted'), so identity — not the state
// value — is the discriminator: an event counts only when
// its entity_id is in `ids`. Each id belongs to one entity
// type, so every surviving event speaks that type's
// alphabet and the `S` cast holds. On equal `at` the
// later-inserted row wins — the order the log captures.
//
// As of the parent-scoped states fence the server returns
// only the caller-org's events, so the id-filter's CROSS-
// TENANT safety role here is now redundant; its DERIVATION
// role (latest-per-entity, by id) remains — hence no deletion.
export function latestStatesForIds<S extends string>(
    events: readonly StateEntity[],
    ids: ReadonlySet<Id>,
): Map<Id, S> {
    const inScope = events.filter(ev => ids.has(ev.entity_id));
    const latest = latestByKey(inScope, ev => ev.entity_id);
    const out = new Map<Id, S>();
    for (const [id, ev] of latest) {
        out.set(id, ev.state as S);
    }
    return out;
}

// A transition event in the shape flow-stats-aggregate
// and the workbox detail presenter expect. Derived
// from the states log: each non-claim event for a
// work order is a transition into state=toNodeId.
// The first event is the creation transition — it has
// no prior node, so its union member carries no
// fromNodeId; every step names the node it left.
// The id is the underlying state event's id — the
// foreign-key target for state_field_values. The
// adapter is the divorce point: the projection exits
// in camelCase; snake_case stays on the storage rows.
export interface CreationTransition {
    kind: 'creation';
    id: Id;
    workOrderId: Id;
    toNodeId: Id;
    memberId: Id;
    at: string;
}

export interface StepTransition {
    kind: 'step';
    id: Id;
    workOrderId: Id;
    fromNodeId: Id;
    toNodeId: Id;
    memberId: Id;
    at: string;
}

export type TransitionEvent =
    | CreationTransition
    | StepTransition;

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
    const latest = latestByKey(transitions, ev => ev.entity_id)
        .get(workOrderId);
    return latest === undefined ? null : latest.state;
}

// Returns the member holding the active claim and
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
): Promise<{ memberId: Id; at: string } | null> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${workOrderId}/history`,
    );
    const claims = events.filter(
        ev => isClaimState(ev.state),
    );
    const latest = latestByKey(claims, ev => ev.entity_id)
        .get(workOrderId);
    if (latest === undefined || latest.state !== 'claimed') {
        return null;
    }
    const elapsedMs = msSinceUtc(latest.at);
    if (elapsedMs >= lockTimeout * MS_PER_SECOND) {
        return null;
    }
    return { memberId: latest.member_id, at: latest.at };
}

// Bulk variant of getWorkOrderActiveClaim for the
// workbox inbox, which resolves every work order's
// active claim at once. One scan over the states log
// builds the latest-claim-per-entity map; each work
// order's claim is then read against its own lockTimeout
// (passed in — the timeout lives in the frozen flow_graph
// the caller already parses). Replaces an N-per-page
// re-derivation of the whole ledger with a single read.
// O(N) on events; Postgres uses an entity_id index.
export async function getActiveClaimsByWorkOrder(
    ctx: RequestContext,
    lockTimeoutByWorkOrder: ReadonlyMap<Id, number>,
): Promise<Map<Id, { memberId: Id; at: string }>> {
    const all = await ctx.GET<StateEntity[]>('states');
    const claims = all.filter(ev => isClaimState(ev.state));
    const latestClaim = latestByKey(claims, ev => ev.entity_id);
    const out = new Map<
        Id, { memberId: Id; at: string }
    >();
    for (const [entityId, ev] of latestClaim) {
        const lockTimeout =
            lockTimeoutByWorkOrder.get(entityId);
        if (lockTimeout === undefined) continue;
        if (ev.state !== 'claimed') continue;
        if (
            msSinceUtc(ev.at)
            >= lockTimeout * MS_PER_SECOND
        ) {
            continue;
        }
        out.set(entityId, {
            memberId: ev.member_id,
            at: ev.at,
        });
    }
    return out;
}

// Project the non-claim events for one work order into
// the TransitionEvent shape consumed by the workbox
// detail presenter and (via the bulk variant below)
// flow-stats-aggregate. The first event becomes the
// creation transition; each later event is a step from
// the prior event's node.
function projectTransitions(
    workOrderId: Id,
    events: readonly StateEntity[],
): TransitionEvent[] {
    const transitions = events
        .filter(ev => !isClaimState(ev.state))
        .toSorted((a, b) => a.at.localeCompare(b.at));
    const out: TransitionEvent[] = [];
    let prior: Id | null = null;
    for (const ev of transitions) {
        const base = {
            id: ev.id,
            workOrderId,
            toNodeId: ev.state,
            memberId: ev.member_id,
            at: ev.at,
        };
        out.push(prior === null
            ? { kind: 'creation', ...base }
            : {
                kind: 'step',
                fromNodeId: prior,
                ...base,
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
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(ideaId);
    if (latest === undefined) {
        throw new Error(
            'no state event for idea ' + ideaId,
        );
    }
    return assertIdeaState(
        latest.state, 'idea ' + ideaId,
    );
}

// Bulk variant for getIdeas, which calls this — so it
// reads the ideas table directly to avoid recursing.
export async function getIdeaStates(
    ctx: RequestContext,
): Promise<Map<Id, IdeaState>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<IdeaEntity[]>('ideas'),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    return latestStatesForIds<IdeaState>(events, ids);
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
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(projectId);
    if (latest === undefined) {
        throw new Error(
            'no state event for project ' + projectId,
        );
    }
    return assertProjectState(
        latest.state, 'project ' + projectId,
    );
}

// Bulk variant for getProjects, which calls this — so it
// reads the projects table directly to avoid recursing.
export async function getProjectStates(
    ctx: RequestContext,
): Promise<Map<Id, ProjectState>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<ProjectEntity[]>('projects'),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    return latestStatesForIds<ProjectState>(events, ids);
}

// Bulk variant for getRecords, which calls this — so it
// reads the records table directly to avoid recursing.
export async function getRecordStates(
    ctx: RequestContext,
): Promise<Map<Id, RecordState>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<RecordEntity[]>('records'),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    return latestStatesForIds<RecordState>(events, ids);
}

// Read the current state for one member from the
// states log. Returns the validated MemberState.
// Throws when no event has been recorded — every
// member created through the supported paths gets
// an initial state event, so absence is a bug,
// not a missing default. The member id is unique
// across the human and AI tables — both produce
// base62 ids from the same generator — so this
// reader serves both kinds without discrimination.
export async function getMemberState(
    ctx: RequestContext,
    memberId: Id,
): Promise<MemberState> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${memberId}/history`,
    );
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(memberId);
    if (latest === undefined) {
        throw new Error(
            'no state event for member ' + memberId,
        );
    }
    return assertMemberState(
        latest.state, 'member ' + memberId,
    );
}

// Bulk variant for the human/ai/system member maps, which
// call this — so it reads the parent members table
// directly (covering all three kinds) to avoid recursing.
export async function getMemberStates(
    ctx: RequestContext,
): Promise<Map<Id, MemberState>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<MemberEntity[]>('members'),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    return latestStatesForIds<MemberState>(events, ids);
}
