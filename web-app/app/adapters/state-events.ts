import type {
    Id, IdeaEntity, IdeaState, IdeaStateDetail,
    ObjectiveEntity, ObjectiveStateDetail,
    ProjectEntity, ProjectState, ProjectStateDetail,
    RecordEntity, RecordStateDetail,
    StateEntity, MemberEntity,
    MemberStateDetail,
} from '../../../api/types.ts';
import {
    assertIdeaState,
    assertObjectiveState,
    assertProjectState,
    assertRecordState,
    assertMemberState,
    msSinceUtc,
    MS_PER_SECOND,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    latestByKey,
} from '../../../shared/ledger-reduction.ts';
import {
    isClaimState,
} from '../../../api/work-order-claims.ts';

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

// Lifecycle trio (Decision 7): state + head event at/id.
// Single and bulk readers share one shape across families;
// named exports keep the Rectification of Names surface.
type AssertState<S extends string> = (
    v: string,
    label: string,
) => S;

type LifecycleTrio<S extends string> = {
    readonly state: S;
    readonly stateAt: string;
    readonly stateEventId: string;
};

async function getEntityStateDetail<S extends string>(
    ctx: RequestContext,
    entityId: Id,
    kind: string,
    assertState: AssertState<S>,
): Promise<LifecycleTrio<S>> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${entityId}/history`,
    );
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(entityId);
    if (latest === undefined) {
        throw new Error(
            'no state event for ' + kind + ' ' + entityId,
        );
    }
    return {
        state: assertState(
            latest.state, kind + ' ' + entityId,
        ),
        stateAt: latest.at,
        stateEventId: latest.id,
    };
}

async function getEntityStateDetails<
    E extends { readonly id: Id },
    S extends string,
>(
    ctx: RequestContext,
    collection: string,
    kind: string,
    assertState: AssertState<S>,
): Promise<Map<Id, LifecycleTrio<S>>> {
    const [events, rows] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        ctx.GET<E[]>(collection),
    ]);
    const ids = new Set<Id>(rows.map(r => r.id));
    const inScope = events.filter(
        ev => ids.has(ev.entity_id),
    );
    const latest = latestByKey(
        inScope, ev => ev.entity_id,
    );
    const out = new Map<Id, LifecycleTrio<S>>();
    for (const [id, ev] of latest) {
        out.set(id, {
            state: assertState(
                ev.state, kind + ' ' + id,
            ),
            stateAt: ev.at,
            stateEventId: ev.id,
        });
    }
    return out;
}

// Single-idea state read, widened to carry the STORED head
// event's `at`/`id` alongside the state — the trio Decision 7
// folds into the idea document (state_at, state_event_id).
// Consumed by getIdea (adapters/ideas.ts) to build the Idea
// domain object.
export async function getIdeaStateDetail(
    ctx: RequestContext,
    ideaId: Id,
): Promise<IdeaStateDetail> {
    return getEntityStateDetail(
        ctx, ideaId, 'idea', assertIdeaState,
    );
}

// Bulk sibling of getIdeaStates, widened the same way.
// Consumed by getIdeas (adapters/ideas.ts) so the ideas LIST
// page can echo each row's trio on a plain field edit
// (drag-reorder) without minting a fresh event. dashboard.ts
// keeps reading the bare getIdeaStates above — unwidened, per
// its own bare-state need and per tests/adapters-state-
// events.test.ts, which pins getIdeaStates' return shape.
export async function getIdeaStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, IdeaStateDetail>> {
    return getEntityStateDetails<
        IdeaEntity, IdeaStateDetail['state']
    >(
        ctx, 'ideas', 'idea', assertIdeaState,
    );
}

// Bulk objective trio read — the getIdeaStateDetails shape.
// Consumed by the organization page so archive/reactivate
// and drag-reorder can echo each objective's current trio
// without minting a fresh event.
export async function getObjectiveStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, ObjectiveStateDetail>> {
    return getEntityStateDetails<
        ObjectiveEntity,
        ObjectiveStateDetail['state']
    >(
        ctx, 'objectives', 'objective',
        assertObjectiveState,
    );
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
    const detail = await getEntityStateDetail(
        ctx, projectId, 'project', assertProjectState,
    );
    return detail.state;
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

// Single-project state read, widened to carry the STORED head
// event's `at`/`id` alongside the state — the trio Decision 7
// folds into the project document (state_at, state_event_id).
// Consumed by getProject (adapters/projects.ts) to build the
// Project domain object.
export async function getProjectStateDetail(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectStateDetail> {
    return getEntityStateDetail(
        ctx, projectId, 'project', assertProjectState,
    );
}

// Bulk sibling of getProjectStates, widened the same way.
// Consumed by getProjects (adapters/projects.ts) so the
// projects LIST page can echo each row's trio on a plain field
// edit (drag-reorder) without minting a fresh event.
// dashboard.ts, flow-export.ts, and project-scoring.ts keep
// reading the bare getProjectStates above — unwidened, per
// their own bare-state need and per tests/adapters-state-
// events.test.ts, which pins getProjectStates' return shape.
export async function getProjectStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, ProjectStateDetail>> {
    return getEntityStateDetails<
        ProjectEntity, ProjectStateDetail['state']
    >(
        ctx, 'projects', 'project', assertProjectState,
    );
}

// Single-record state read, widened to carry the STORED head
// event's `at`/`id` alongside the state — the trio Decision 7
// folds into the record document (state_at, state_event_id).
// Consumed by getRecordModel (adapters/records.ts) to build the
// RecordModel domain object.
export async function getRecordStateDetail(
    ctx: RequestContext,
    recordId: Id,
): Promise<RecordStateDetail> {
    return getEntityStateDetail(
        ctx, recordId, 'record', assertRecordState,
    );
}

// Bulk sibling of getRecordStateDetail, widened the same way.
// Consumed by getRecords (adapters/records.ts) so the records
// LIST page can echo each row's trio on a plain field edit
// (drag-reorder) without minting a fresh event.
export async function getRecordStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, RecordStateDetail>> {
    return getEntityStateDetails<
        RecordEntity, RecordStateDetail['state']
    >(
        ctx, 'records', 'record', assertRecordState,
    );
}

// Single-member state read, widened to carry the STORED
// head event's `at`/`id` alongside the state — the trio
// Decision 7 folds into the member document (state_at,
// state_event_id). Throws when no event has been recorded
// — every member created through the supported paths gets
// an initial state event, so absence is a bug, not a
// missing default. The member id is unique across the
// human and AI tables — both produce base62 ids from the
// same generator — so this reader serves both kinds
// without discrimination.
export async function getMemberStateDetail(
    ctx: RequestContext,
    memberId: Id,
): Promise<MemberStateDetail> {
    return getEntityStateDetail(
        ctx, memberId, 'member', assertMemberState,
    );
}

// Bulk sibling of getMemberStateDetail, widened the same
// way. Consumed by the human/ai/system member maps so a
// plain detail edit can echo each row's trio without
// minting a fresh event. Reads the parent members table
// directly (covering all three kinds) to avoid recursing.
export async function getMemberStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, MemberStateDetail>> {
    return getEntityStateDetails<
        MemberEntity, MemberStateDetail['state']
    >(
        ctx, 'members', 'member', assertMemberState,
    );
}
