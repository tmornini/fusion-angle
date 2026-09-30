import type {
    Id,
    ObjectiveEntity,
    ObjectiveId,
    ObjectiveRevisionEntity,
} from '../shared/types.ts';
import {
    nowUtc,
} from '../shared/types.ts';
import {
    type RequestContext,
    organizationCollection,
    organizationItem,
} from './request-context.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
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
    return ctx.GET<ObjectiveEntity[]>(
        organizationCollection(ctx, 'objectives'),
    );
}

export async function getObjective(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<ObjectiveEntity> {
    return ctx.GET<ObjectiveEntity>(
        organizationItem(ctx, 'objectives', id),
    );
}

// The objective with the tag of the head it was read from,
// which a merge latches.
async function getObjectiveWithEtag(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<{ objective: ObjectiveEntity; etag: string }> {
    const read = await ctx.GETWithEtag<ObjectiveEntity>(
        organizationItem(ctx, 'objectives', id),
    );
    if (read.etag === undefined) {
        throw new Error('the objective GET carried no ETag');
    }
    return { objective: read.body, etag: read.etag };
}

export function activeObjectivesOf(
    rows: readonly ObjectiveEntity[],
): ObjectiveEntity[] {
    return rows
        .filter(o => o.state === 'active')
        .sort((a, b) => a.position - b.position);
}

// Archived set from the GET-stamped state on each objective
// row — no second hop.
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

// A versions index row: the entity snapshot plus the
// pair facts the list stamps on every row (etag is the
// message-pair id).
export interface ObjectiveVersionRow
    extends ObjectiveEntity {
    etag: string;
    at: string;
    member_id: Id;
}

// Parallel GET objectives/:id/versions/ for each live
// objective. Rows are entity snapshots stamped with pair
// facts. Source for the lifecycle stream.
export async function getObjectiveHistories(
    ctx: RequestContext,
): Promise<Map<Id, ObjectiveVersionRow[]>> {
    const rows = await ctx.GET<{ id: Id }[]>(
        organizationCollection(ctx, 'objectives'),
    );
    const pairs = await Promise.all(
        rows.map(async (row) => {
            const versions = await ctx.GET<
                ObjectiveVersionRow[]
            >(
                organizationItem(ctx, 'objectives', row.id)
                    + '/versions/',
            );
            return [row.id, versions] as const;
        }),
    );
    return new Map(pairs);
}

export interface ObjectiveLifecycleEvent {
    objectiveId: ObjectiveId;
    kind: 'archival' | 'reactivation';
    memberId: Id;
    at: string;
}

// One event per lifecycle TRANSITION, walked oldest-
// first per objective: archived after non-archived is an
// archival; non-archived after archived is a
// reactivation. Echo versions (a position PUT re-sending
// the standing state) collapse; genesis-active is never
// an event. Consumed by the project score-history
// presenter.
export async function getObjectiveLifecycleEvents(
    ctx: RequestContext,
): Promise<ObjectiveLifecycleEvent[]> {
    const histories =
        await getObjectiveHistories(ctx);
    const events: ObjectiveLifecycleEvent[] = [];
    for (
        const [objectiveId, versions] of histories
    ) {
        let previous: string | undefined;
        for (const row of versions.toReversed()) {
            const transition =
                row.state === 'archived'
                    ? previous !== 'archived'
                    : previous === 'archived';
            if (transition) {
                events.push({
                    objectiveId,
                    kind:
                        row.state === 'archived'
                            ? 'archival'
                            : 'reactivation',
                    memberId: row.member_id,
                    at: row.at,
                });
            }
            previous = row.state;
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
    return activeObjectivesOf(await getObjectives(ctx));
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
    const revisionId = generateIdentifier();
    // The objective row and its first revision commit as ONE
    // transaction server-side. The body OMITS organization_id —
    // the org fence stamps it from the verified token. The
    // revision's member_id is a row column (who authored the
    // definition), supplied here.
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
    const revisionId = generateIdentifier();
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
// head (the GET-stamped state is never re-sent); the
// transition sends the new state fresh. The PUT latches the
// head it read, so a drag-reorder landing in between refuses
// this one with a 412 rather than being overwritten.
export async function postObjectiveArchival(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    const { objective, etag } =
        await getObjectiveWithEtag(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
            position: objective.position,
            state: 'archived',
        },
        [['if-match', '"' + etag + '"']],
    );
    notifyObjectiveChange();
}

export async function postObjectiveReactivation(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    const { objective, etag } =
        await getObjectiveWithEtag(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
            position: objective.position,
            state: 'active',
        },
        [['if-match', '"' + etag + '"']],
    );
    notifyObjectiveChange();
}

// A reorder carries only the position: the state comes from
// the head this call read, so an archive or reactivation
// written since the caller's page load is kept, and the PUT
// latches that head.
export async function putObjectivePosition(
    ctx: RequestContext,
    id: ObjectiveId,
    position: number,
): Promise<void> {
    const { objective, etag } =
        await getObjectiveWithEtag(ctx, id);
    await ctx.PUT(
        organizationItem(ctx, 'objectives', id),
        {
            position,
            state: objective.state,
        },
        [['if-match', '"' + etag + '"']],
    );
    notifyObjectiveChange();
}
