import type {
    WorkerId,
    HumanWorkerEntity,
    WorkerState,
} from '../../../api/types.ts';
import { HumanWorker } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildStateEventOp,
    getWorkerState,
    getWorkerStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    HumanWorker,
    WORKER_STATE_CONFIG,
    isWorkerState,
} from '../../../api/types.ts';
export type {
    WorkerId,
    HumanWorkerEntity,
    WorkerState,
} from '../../../api/types.ts';

const humanWorkerChanges =
    createSubscriptionChannel(['workers', 'states']);

export function subscribeHumanWorkerChanges(
    fn: () => void,
): () => void {
    return humanWorkerChanges.subscribe(fn);
}

export function notifyHumanWorkerChange(): void {
    humanWorkerChanges.notify();
}

export async function getHumanWorkerRows(
    ctx: RequestContext,
): Promise<HumanWorkerEntity[]> {
    return ctx.GET<HumanWorkerEntity[]>('workers');
}

export async function getHumanWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, HumanWorker>> {
    const [rows, stateMap] = await Promise.all([
        getHumanWorkerRows(ctx),
        getWorkerStates(ctx),
    ]);
    return new Map(
        rows.map(entity => {
            const state = stateMap.get(entity.id);
            if (state === undefined) {
                throw new Error(
                    'no state event for human worker '
                    + entity.id,
                );
            }
            return [
                entity.id,
                new HumanWorker(entity, state),
            ];
        }),
    );
}

export async function getCurrentHumanWorker(
    ctx: RequestContext,
): Promise<HumanWorkerEntity> {
    return ctx.GET<HumanWorkerEntity>(
        'current-worker',
    );
}

const TOP_HUMAN_WORKER_COUNT = 6;

export async function getHumanWorkers(
    ctx: RequestContext,
): Promise<HumanWorker[]> {
    const workerMap = await getHumanWorkerMap(ctx);
    return Array.from(workerMap.values());
}

export function featuredHumanWorkers(
    workers: HumanWorker[],
): HumanWorker[] {
    return workers
        .filter(worker => worker.hasDepartment())
        .slice(0, TOP_HUMAN_WORKER_COUNT);
}

export async function getHumanWorker(
    ctx: RequestContext,
    id: string,
): Promise<HumanWorker> {
    const [row, state] = await Promise.all([
        ctx.GET<HumanWorkerEntity>(`workers/${id}`),
        getWorkerState(ctx, id),
    ]);
    return new HumanWorker(row, state);
}

export async function getHumanWorkerRow(
    ctx: RequestContext,
    id: string,
): Promise<HumanWorkerEntity> {
    return ctx.GET<HumanWorkerEntity>(
        `workers/${id}`,
    );
}

export async function putHumanWorker(
    ctx: RequestContext,
    id: string,
    entity: Omit<HumanWorkerEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`workers/${id}`, entity);
    humanWorkerChanges.notify();
}

// Human-worker row write paired with a states-log
// event in one ctx.commit batch. Use at every site
// that creates a worker or moves its lifecycle
// state. putHumanWorker remains for pure edits
// (phone, bio, title) that do not change state.
// Stage 10b+c: the states log is now the sole
// source of worker state; the row carries no
// status column.
export async function postHumanWorkerStateChange(
    ctx: RequestContext,
    id: string,
    entity: Omit<HumanWorkerEntity, 'id'>,
    state: WorkerState,
): Promise<void> {
    const workerBody =
        entity as unknown as Record<string, unknown>;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `workers/${id}`,
                body: workerBody,
            },
            await buildStateEventOp(ctx, id, state),
        ],
    });
    humanWorkerChanges.notify();
}

// Archives a human worker by writing a terminal
// 'archived' state event. The row persists — only
// the lifecycle stage advances. Mirrors
// archiveAIWorker per Commandment III (Uniformity):
// one operation name across worker kinds.
export async function archiveHumanWorker(
    ctx: RequestContext,
    id: WorkerId,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx, id, 'archived',
            ),
        ],
    });
    humanWorkerChanges.notify();
}
