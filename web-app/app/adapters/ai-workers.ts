import type {
    WorkerId,
    AIWorkerEntity,
} from '../../../api/types.ts';
import { AIWorker } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

export {
    AIWorker,
} from '../../../api/types.ts';
export type {
    AIWorkerEntity,
} from '../../../api/types.ts';

const aiWorkerChanges =
    createSubscriptionChannel(['ai_workers']);

export function subscribeAIWorkerChanges(
    fn: () => void,
): () => void {
    return aiWorkerChanges.subscribe(fn);
}

export function notifyAIWorkerChange(): void {
    aiWorkerChanges.notify();
}

export async function getAIWorkerRows(
    ctx: RequestContext,
): Promise<AIWorkerEntity[]> {
    return ctx.GET<AIWorkerEntity[]>('ai-workers');
}

export async function getAIWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, AIWorker>> {
    const rows = await getAIWorkerRows(ctx);
    return new Map(
        rows.map(
            entity => [
                entity.id,
                new AIWorker(entity),
            ],
        ),
    );
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
    const row = await getAIWorkerRow(ctx, id);
    return new AIWorker(row);
}

export async function getAIWorkerRow(
    ctx: RequestContext,
    id: WorkerId,
): Promise<AIWorkerEntity> {
    return ctx.GET<AIWorkerEntity>(
        `ai-workers/${id}`,
    );
}

export async function putAIWorker(
    ctx: RequestContext,
    id: WorkerId,
    entity: Omit<AIWorkerEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`ai-workers/${id}`, entity);
    aiWorkerChanges.notify();
}

export async function deleteAIWorker(
    ctx: RequestContext,
    id: WorkerId,
): Promise<void> {
    await ctx.DELETE(`ai-workers/${id}`);
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
