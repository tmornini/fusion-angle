import type {
    Id,
    ObjectiveEntity,
    ObjectiveId,
    ObjectiveRevisionEntity,
    ObjectiveStateDetail,
} from '../../../api/types.ts';
import {
    assertObjectiveState,
    nowUtc,
} from '../../../api/types.ts';
import {
    type RequestContext,
    organizationCollection,
    organizationItem,
    withLifecycleTrio,
    withLifecycleTrios,
} from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    getCurrentHumanMember,
} from './members.ts';

const objectiveChanges =
    createSubscriptionChannel();

export function subscribeObjectiveChanges(
    fn: () => void,
): () => void {
    return objectiveChanges.subscribe(fn);
}

export function notifyObjectiveChange(): void {
    objectiveChanges.notify();
}

export async function getObjectives(
    ctx: RequestContext,
): Promise<ObjectiveEntity[]> {
    return withLifecycleTrios(
        ctx, 'objectives',
        await ctx.GET<ObjectiveEntity[]>(
            organizationCollection(ctx, 'objectives'),
        ),
    );
}

export async function getObjective(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<ObjectiveEntity> {
    return withLifecycleTrio(
        ctx, 'objectives',
        await ctx.GET<ObjectiveEntity>(
            organizationItem(ctx, 'objectives', id),
        ),
    );
}

// Lifecycle-current trio is stamped on the ObjectiveEntity
// GET row (Phase A). Map snake_case wire → ObjectiveStateDetail;
// no second hop to a lifecycle log or history alias.
export function objectiveStateDetailFromRow(
    row: ObjectiveEntity,
): ObjectiveStateDetail {
    return {
        state: assertObjectiveState(
            row.state, 'objective ' + row.id,
        ),
    };
}

// Bulk objective trio read from GET-stamped rows — drag-
// reorder and archive/reactivate echo each id's current
// trio without minting a fresh event.
export async function getObjectiveStateDetails(
    ctx: RequestContext,
): Promise<Map<Id, ObjectiveStateDetail>> {
    const rows = await getObjectives(ctx);
    const out = new Map<Id, ObjectiveStateDetail>();
    for (const row of rows) {
        out.set(
            row.id, objectiveStateDetailFromRow(row),
        );
    }
    return out;
}

// Archived set from the GET-stamped lifecycle trio on
// each objective row — no hop to the states log.
export async function getArchivedObjectiveIds(
    ctx: RequestContext,
): Promise<Set<ObjectiveId>> {
    const objectives = await getObjectives(ctx);
    return new Set(
        objectives
            .filter(o => o.state === 'archived')
            .map(o => o.id),
    );
}

// Parallel GET objectives/:id/versions/ for each live
// objective. Rows are collection-item shape (state, not
// StateEntity). Source for the archival stream.
export async function getObjectiveHistories(
    ctx: RequestContext,
): Promise<Map<Id, ObjectiveEntity[]>> {
    const rows = await ctx.GET<{ id: Id }[]>(
        organizationCollection(ctx, 'objectives'),
    );
    const pairs = await Promise.all(
        rows.map(async (row) => {
            const versions = await ctx.GET<
                ObjectiveEntity[]
            >(
                organizationItem(ctx, 'objectives', row.id)
                    + '/versions/',
            );
            return [row.id, versions] as const;
        }),
    );
    return new Map(pairs);
}

export interface ObjectiveArchivalEvent {
    objectiveId: ObjectiveId;
}

// Streams every `state='archived'` version from the
// per-item versions door — one event per archival,
// including re-archivals after reactivation. Consumed
// by the project score-history presenter. Versions
// carry no member or at; those facts live on the pair.
export async function getObjectiveArchivalEvents(
    ctx: RequestContext,
): Promise<ObjectiveArchivalEvent[]> {
    const histories = await getObjectiveHistories(ctx);
    const events: ObjectiveArchivalEvent[] = [];
    for (const [objectiveId, versions] of histories) {
        for (const row of versions) {
            if (row.state === 'archived') {
                events.push({ objectiveId });
            }
        }
    }
    return events;
}

// The camelCase domain shape of an objective revision.
// The adapter is the divorce point: storage rows
// (snake_case) are mapped here so the score-history
// presenter and the definition reducers speak one idiom.
export interface ObjectiveRevision {
    id: Id;
    objectiveId: ObjectiveId;
    name: string;
    description: string;
    memberId: Id;
    at: string;
}

function toObjectiveRevision(
    r: ObjectiveRevisionEntity,
): ObjectiveRevision {
    return {
        id: r.id,
        objectiveId: r.objective_id,
        name: r.name,
        description: r.description,
        memberId: r.member_id,
        at: r.at,
    };
}

// The revisions for ONE objective — the server filters the
// nested collection to the parent objective, so no client filter
// is needed.
async function getRevisionsForObjective(
    ctx: RequestContext,
    objectiveId: ObjectiveId,
): Promise<ObjectiveRevisionEntity[]> {
    return ctx.GET<ObjectiveRevisionEntity[]>(
        organizationItem(ctx, 'objectives', objectiveId)
            + '/revisions/',
    );
}

// The revisions for each supplied objective, grouped — reassembled
// from the nested per-objective collections, fetched in parallel.
// Callers walking an objective LIST pass the ids they hold.
export async function getObjectiveRevisionsByObjective(
    ctx: RequestContext,
    objectiveIds: readonly ObjectiveId[],
): Promise<Map<ObjectiveId, ObjectiveRevision[]>> {
    const perObjective = await Promise.all(
        objectiveIds.map(id => getRevisionsForObjective(ctx, id)),
    );
    return Map.groupBy(
        perObjective.flat().map(toObjectiveRevision),
        r => r.objectiveId,
    );
}

// The current definition of every requested objective in
// one table read. Throws on an objective with no
// revisions: creation writes the first revision in the
// same commit, so the absence is an impossible state.
export async function getCurrentObjectiveDefinitions(
    ctx: RequestContext,
    ids: readonly ObjectiveId[],
): Promise<Map<ObjectiveId, {
    name: string;
    description: string;
}>> {
    const grouped =
        await getObjectiveRevisionsByObjective(ctx, ids);
    const defs = new Map<ObjectiveId, {
        name: string;
        description: string;
    }>();
    for (const id of ids) {
        const revs = grouped.get(id);
        if (!revs) {
            throw new Error(
                'no revisions for objective ' + id,
            );
        }
        let latest = revs[0]!;
        for (const r of revs) {
            if (
                r.at.localeCompare(latest.at) > 0
            ) {
                latest = r;
            }
        }
        defs.set(id, {
            name: latest.name,
            description: latest.description,
        });
    }
    return defs;
}

export async function getActiveObjectives(
    ctx: RequestContext,
): Promise<ObjectiveEntity[]> {
    const all = await getObjectives(ctx);
    return all
        .filter(o => o.state === 'active')
        .sort((a, b) => a.position - b.position);
}

// The single-id form, for id-scoped gestures (e.g. the
// organization page's edit dialog). List walkers use the
// batched form — same reduce, one read.
export async function getCurrentObjectiveDefinition(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<{ name: string; description: string }> {
    const defs =
        await getCurrentObjectiveDefinitions(
            ctx, [id],
        );
    return defs.get(id)!;
}

export async function postObjectiveCreation(
    ctx: RequestContext,
    id: ObjectiveId,
    name: string,
    description: string,
    position: number,
): Promise<void> {
    const at = nowUtc();
    const member = await getCurrentHumanMember(ctx);
    const revisionId = generateCryptoSafeBase62();
    // The objective row and its first revision commit as ONE
    // transaction server-side. The body OMITS organization_id —
    // the org fence stamps it from the verified token. The
    // revision's member_id is a row column (who authored the
    // definition), supplied here. Genesis trio mints with the
    // create body (states-address retirement) — no separate
    // states/:id event.
    await ctx.POST(
        organizationCollection(ctx, 'objectives'),
        {
        id,
        objective: {
            position,
        },
        revisionId,
        revision: {
            objective_id: id,
            name,
            description,
            member_id: member.id,
            at,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
        initialStateAt: at,
    });
    notifyObjectiveChange();
}

export async function postObjectiveRevision(
    ctx: RequestContext,
    id: ObjectiveId,
    name: string,
    description: string,
): Promise<void> {
    const at = nowUtc();
    const member = await getCurrentHumanMember(ctx);
    const revisionId = generateCryptoSafeBase62();
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id)
            + '/revisions/' + revisionId,
        {
            objective_id: id,
            name,
            description,
            member_id: member.id,
            at,
        },
    );
    notifyObjectiveChange();
}

// Read-then-put: only position is echoed from the current
// head (GET-stamped snake_case lifecycle trio is never
// re-sent); the transition trio is minted fresh. The get-
// then-put race against a concurrent drag-reorder is
// ACCEPTED (spec §2) — objectives concurrency is 'simple'
// and the page is admin-facing.
export async function postObjectiveArchival(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    const current = await getObjective(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
        position: current.position,
        state: 'archived',
    });
    notifyObjectiveChange();
}

export async function postObjectiveReactivation(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    const current = await getObjective(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
        position: current.position,
        state: 'active',
    });
    notifyObjectiveChange();
}

export async function putObjectivePosition(
    ctx: RequestContext,
    id: ObjectiveId,
    position: number,
    stateDetail: ObjectiveStateDetail,
): Promise<void> {
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
        position,
        state: stateDetail.state,
    });
    notifyObjectiveChange();
}
