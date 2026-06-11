import type {
    Id,
    Objective,
    ObjectiveId,
    ObjectiveRevisionEntity,
    ObjectiveState,
    StateEntity,
} from '../../../api/types.ts';
import {
    nowUtc,
} from '../../../api/types.ts';
import {
    type RequestContext,
} from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    buildStateEventOp,
    latestStatesForIds,
} from './state-events.ts';
import {
    getCurrentHumanMember,
} from './members.ts';

const objectiveChanges =
    createSubscriptionChannel([
        'objectives',
        'objective_revisions',
        'states',
    ]);

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
): Promise<Objective[]> {
    return ctx.GET<Objective[]>('objectives');
}

export async function getArchivedObjectiveIds(
    ctx: RequestContext,
): Promise<Set<ObjectiveId>> {
    const [events, objectives] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        getObjectives(ctx),
    ]);
    const ids = new Set<Id>(objectives.map(o => o.id));
    const latest =
        latestStatesForIds<ObjectiveState>(events, ids);
    const archived = new Set<ObjectiveId>();
    for (const [id, state] of latest) {
        if (state === 'archived') {
            archived.add(id as ObjectiveId);
        }
    }
    return archived;
}

export interface ObjectiveArchivalEvent {
    objectiveId: ObjectiveId;
    memberId: Id;
    at: string;
}

// Streams every `state='archived'` event from the
// state log — one event per archival, including
// re-archivals after reactivation. Consumed by the
// project score-history presenter which renders each
// event chronologically alongside scoring rows. The
// `'archived'` value is shared across entity
// alphabets, so we restrict to objective ids.
export async function getObjectiveArchivalEvents(
    ctx: RequestContext,
): Promise<ObjectiveArchivalEvent[]> {
    const [rows, objectives] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        getObjectives(ctx),
    ]);
    const objectiveIds = new Set<string>(
        objectives.map(o => o.id),
    );
    return rows
        .filter(r =>
            r.state === 'archived'
            && objectiveIds.has(r.entity_id),
        )
        .map(r => ({
            objectiveId: r.entity_id as ObjectiveId,
            memberId: r.member_id,
            at: r.at,
        }));
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

// Every objective's revisions in ONE table read, grouped.
// Callers walking an objective LIST batch here.
export async function getObjectiveRevisionsByObjective(
    ctx: RequestContext,
): Promise<Map<ObjectiveId, ObjectiveRevision[]>> {
    const all = await ctx.GET<ObjectiveRevisionEntity[]>(
        'objective-revisions',
    );
    return Map.groupBy(
        all.map(toObjectiveRevision),
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
        await getObjectiveRevisionsByObjective(ctx);
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
): Promise<Objective[]> {
    const [all, archived] = await Promise.all([
        getObjectives(ctx),
        getArchivedObjectiveIds(ctx),
    ]);
    return all
        .filter(o => !archived.has(o.id))
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
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `objectives/${id}`,
                body: {
                    position,
                },
            },
            {
                method: 'put',
                resource:
                    `objective-revisions/${revisionId}`,
                body: {
                    objective_id: id,
                    name,
                    description,
                    member_id: member.id,
                    at,
                },
            },
        ],
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
    await ctx.commit({
        ops: [{
            method: 'put',
            resource:
                `objective-revisions/${revisionId}`,
            body: {
                objective_id: id,
                name,
                description,
                member_id: member.id,
                at,
            },
        }],
    });
    notifyObjectiveChange();
}

export async function postObjectiveArchival(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx, id, 'archived',
            ),
        ],
    });
    notifyObjectiveChange();
}

export async function postObjectiveReactivation(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(ctx, id, 'active'),
        ],
    });
    notifyObjectiveChange();
}

export async function putObjectivePosition(
    ctx: RequestContext,
    id: ObjectiveId,
    position: number,
): Promise<void> {
    await ctx.commit({
        ops: [{
            method: 'put' as const,
            resource: `objectives/${id}`,
            body: {
                position,
            },
        }],
    });
    notifyObjectiveChange();
}
