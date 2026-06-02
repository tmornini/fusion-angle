import type {
    WorkerId,
    WorkerEntity,
    AIWorkerEntity,
    WorkerState,
} from '../../../api/types.ts';
import { AIWorker } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    buildStateEventOp,
    getWorkerState,
    getWorkerStates,
} from './state-events.ts';

export {
    AIWorker,
} from '../../../api/types.ts';
export type {
    AIWorkerEntity,
} from '../../../api/types.ts';

const aiWorkerChanges =
    createSubscriptionChannel(['ai_workers', 'states']);

export function subscribeAIWorkerChanges(
    fn: () => void,
): () => void {
    return aiWorkerChanges.subscribe(fn);
}

export function notifyAIWorkerChange(): void {
    aiWorkerChanges.notify();
}

export type AIWorkerDraft =
    Omit<AIWorkerEntity, 'id'> & { name: string };

export interface AIWorkerRow extends AIWorkerEntity {
    name: string;
}

export async function getAIWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, AIWorker>> {
    const [parents, details, stateMap] =
        await Promise.all([
            ctx.GET<WorkerEntity[]>('workers'),
            ctx.GET<AIWorkerEntity[]>('ai-workers'),
            getWorkerStates(ctx),
        ]);
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const map = new Map<WorkerId, AIWorker>();
    for (const parent of parents) {
        if (parent.type !== 'ai') continue;
        const detail = detailById.get(parent.id);
        if (detail === undefined) {
            throw new Error(
                'no AI detail for worker ' + parent.id,
            );
        }
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for AI worker '
                + parent.id,
            );
        }
        map.set(
            parent.id,
            new AIWorker(parent, detail, state),
        );
    }
    return map;
}

export async function getAIWorkers(
    ctx: RequestContext,
): Promise<AIWorker[]> {
    const map = await getAIWorkerMap(ctx);
    return Array.from(map.values());
}

export async function getAIWorker(
    ctx: RequestContext,
    id: WorkerId,
): Promise<AIWorker> {
    const [parent, detail, state] =
        await Promise.all([
            ctx.GET<WorkerEntity>(`workers/${id}`),
            ctx.GET<AIWorkerEntity>(
                `ai-workers/${id}`,
            ),
            getWorkerState(ctx, id),
        ]);
    return new AIWorker(parent, detail, state);
}

export async function getAIWorkerRow(
    ctx: RequestContext,
    id: WorkerId,
): Promise<AIWorkerRow> {
    const [parent, detail] = await Promise.all([
        ctx.GET<WorkerEntity>(`workers/${id}`),
        ctx.GET<AIWorkerEntity>(`ai-workers/${id}`),
    ]);
    return { ...detail, name: parent.name };
}

// Edits only; creation goes through
// postAIWorkerCreation.
export async function putAIWorker(
    ctx: RequestContext,
    id: WorkerId,
    input: AIWorkerDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `workers/${id}`,
                body: { type: 'ai', name },
            },
            {
                method: 'put',
                resource: `ai-workers/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
        ],
    });
    aiWorkerChanges.notify();
}

// Creation also emits the initial 'active' state
// event, so it cannot reuse putAIWorker (edits only).
// Use at every site that creates an AI worker.
export async function postAIWorkerCreation(
    ctx: RequestContext,
    id: WorkerId,
    input: AIWorkerDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `workers/${id}`,
                body: { type: 'ai', name },
            },
            {
                method: 'put',
                resource: `ai-workers/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
            await buildStateEventOp(ctx, id, 'active'),
        ],
    });
    aiWorkerChanges.notify();
}

export async function postAIWorkerStateChange(
    ctx: RequestContext,
    id: WorkerId,
    state: WorkerState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(ctx, id, state),
        ],
    });
    aiWorkerChanges.notify();
}
