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

// Split an AI-worker edit across the parent (type +
// name) and detail rows. Creation goes through
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

// AI-worker creation: parent row + detail row + initial
// 'active' state event in one ctx.commit batch. Use at
// every site that creates an AI worker. putAIWorker
// remains for pure edits (name, provider, auth_token)
// that do not change the lifecycle stage.
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

// Token masking: show last 4 characters
// preceded by an ellipsis. Used by the AI
// worker detail presenter; the AIWorker
// class also exposes the same logic via
// .maskedToken(). Free-standing helper here
// for callers that hold a raw token string
// without an AIWorker instance.
export function maskAuthToken(
    token: string,
): string {
    if (token.length <= 4) return token;
    return token.slice(0, 3)
        + '…'
        + token.slice(-4);
}
