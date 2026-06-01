import type {
    WorkerId,
    WorkerEntity,
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
    isDimensionKey,
} from '../../../api/types.ts';
export type {
    WorkerId,
    HumanWorkerEntity,
    WorkerState,
    DimensionKey,
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

// A human worker draft: the parent display name plus
// the detail fields, as the Add Worker dialog and the
// edit form supply them. Split into the two table rows
// at the write seam below.
export type HumanWorkerDraft =
    Omit<HumanWorkerEntity, 'id'> & { name: string };

// A human worker composed for the editor: parent name
// merged onto the detail row. Lifecycle state is read
// separately from the states log.
export interface HumanWorkerRow extends HumanWorkerEntity {
    name: string;
}

export async function getHumanWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, HumanWorker>> {
    const [parents, details, stateMap] =
        await Promise.all([
            ctx.GET<WorkerEntity[]>('workers'),
            ctx.GET<HumanWorkerEntity[]>(
                'human-workers',
            ),
            getWorkerStates(ctx),
        ]);
    const detailById = new Map(
        details.map(d => [d.id, d]),
    );
    const map = new Map<WorkerId, HumanWorker>();
    for (const parent of parents) {
        if (parent.type !== 'human') continue;
        const detail = detailById.get(parent.id);
        if (detail === undefined) {
            throw new Error(
                'no human detail for worker '
                + parent.id,
            );
        }
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for human worker '
                + parent.id,
            );
        }
        map.set(
            parent.id,
            new HumanWorker(parent, detail, state),
        );
    }
    return map;
}

export async function getCurrentHumanWorker(
    ctx: RequestContext,
): Promise<WorkerEntity> {
    return ctx.GET<WorkerEntity>(
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
    const [parent, detail, state] =
        await Promise.all([
            ctx.GET<WorkerEntity>(`workers/${id}`),
            ctx.GET<HumanWorkerEntity>(
                `human-workers/${id}`,
            ),
            getWorkerState(ctx, id),
        ]);
    return new HumanWorker(parent, detail, state);
}

export async function getHumanWorkerRow(
    ctx: RequestContext,
    id: string,
): Promise<HumanWorkerRow> {
    const [parent, detail] = await Promise.all([
        ctx.GET<WorkerEntity>(`workers/${id}`),
        ctx.GET<HumanWorkerEntity>(
            `human-workers/${id}`,
        ),
    ]);
    return { ...detail, name: parent.name };
}

// Split a human-worker write across the parent (type +
// name) and detail rows. Used by edits; creation goes
// through postHumanWorkerCreation.
export async function putHumanWorker(
    ctx: RequestContext,
    id: string,
    input: HumanWorkerDraft,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `workers/${id}`,
                body: { type: 'human', name },
            },
            {
                method: 'put',
                resource: `human-workers/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
        ],
    });
    humanWorkerChanges.notify();
}

// Human-worker creation: parent row + detail row +
// initial state event in one ctx.commit batch. Use only
// at the Add Worker call site; transitions of an
// existing worker go through postHumanWorkerStateChange.
export async function postHumanWorkerCreation(
    ctx: RequestContext,
    id: string,
    input: HumanWorkerDraft,
    initialState: WorkerState,
): Promise<void> {
    const { name, ...detail } = input;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `workers/${id}`,
                body: { type: 'human', name },
            },
            {
                method: 'put',
                resource: `human-workers/${id}`,
                body: detail as unknown as
                    Record<string, unknown>,
            },
            await buildStateEventOp(
                ctx, id, initialState,
            ),
        ],
    });
    humanWorkerChanges.notify();
}

export async function postHumanWorkerStateChange(
    ctx: RequestContext,
    id: string,
    state: WorkerState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(ctx, id, state),
        ],
    });
    humanWorkerChanges.notify();
}
