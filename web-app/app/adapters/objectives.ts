import type {
    Objective,
    ObjectiveId,
    ObjectiveRevision,
    StateEntity,
} from '../../../api/types.ts';
import { nowUtc } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    buildStateEventOp,
} from './state-events.ts';

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

export async function getObjective(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<Objective> {
    return ctx.GET<Objective>(
        `objectives/${id}`,
    );
}

export async function getObjectives(
    ctx: RequestContext,
): Promise<Objective[]> {
    return ctx.GET<Objective[]>('objectives');
}

export async function getArchivedObjectiveIds(
    ctx: RequestContext,
): Promise<Set<ObjectiveId>> {
    const [rows, objectives] = await Promise.all([
        ctx.GET<StateEntity[]>('states'),
        getObjectives(ctx),
    ]);
    const objectiveIds = new Set<string>(
        objectives.map(o => o.id),
    );
    // Iterate in insertion order; on `at` tie the
    // later-inserted row wins. `nowUtc()` resolves to
    // milliseconds so back-to-back mutations on a fast
    // machine can collide; insertion order is the
    // deterministic tiebreak the event log already
    // captures. The `'archived'` value is shared across
    // entity alphabets, so we restrict to objective ids.
    const latestByEntity = new Map<string, StateEntity>();
    for (const row of rows) {
        if (!objectiveIds.has(row.entity_id)) continue;
        const seen = latestByEntity.get(row.entity_id);
        if (seen === undefined || row.at >= seen.at) {
            latestByEntity.set(row.entity_id, row);
        }
    }
    const archived = new Set<ObjectiveId>();
    for (const [entityId, row] of latestByEntity) {
        if (row.state === 'archived') {
            archived.add(entityId as ObjectiveId);
        }
    }
    return archived;
}

export interface ObjectiveArchivalEvent {
    objectiveId: ObjectiveId;
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
            at: r.at,
        }));
}

export async function getObjectiveRevisions(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<ObjectiveRevision[]> {
    const all = await ctx.GET<ObjectiveRevision[]>(
        'objective-revisions',
    );
    return all.filter(
        r => r.objective_id === id,
    );
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

export async function getCurrentObjectiveDefinition(
    ctx: RequestContext,
    id: ObjectiveId,
): Promise<{ name: string; description: string }> {
    const revs = await getObjectiveRevisions(ctx, id);
    if (revs.length === 0) {
        throw new Error(
            'no revisions for objective ' + id,
        );
    }
    revs.sort((a, b) =>
        b.at.localeCompare(a.at),
    );
    const latest = revs[0]!;
    return {
        name: latest.name,
        description: latest.description,
    };
}

export async function getObjectiveDefinitionAt(
    ctx: RequestContext,
    id: ObjectiveId,
    atTime: string,
): Promise<{ name: string; description: string }> {
    const revs = await getObjectiveRevisions(ctx, id);
    const eligible = revs.filter(
        r => r.at <= atTime,
    );
    if (eligible.length === 0) {
        throw new Error(
            'no revision of ' + id
            + ' at or before ' + atTime,
        );
    }
    eligible.sort((a, b) =>
        b.at.localeCompare(a.at),
    );
    const latest = eligible[0]!;
    return {
        name: latest.name,
        description: latest.description,
    };
}

export async function postObjectiveCreation(
    ctx: RequestContext,
    id: ObjectiveId,
    name: string,
    description: string,
    position: number,
): Promise<void> {
    const at = nowUtc();
    const revisionId = generateCryptoSafeBase62();
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `objectives/${id}`,
                body: { position },
            },
            {
                method: 'put',
                resource:
                    `objective-revisions/${revisionId}`,
                body: {
                    objective_id: id,
                    name,
                    description,
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
            body: { position },
        }],
    });
    notifyObjectiveChange();
}
