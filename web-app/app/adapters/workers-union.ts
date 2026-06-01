import type {
    WorkerId,
    Worker,
    WorkerEntity,
} from '../../../api/types.ts';
import { SystemWorker } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getHumanWorkers,
} from './workers.ts';
import {
    getAIWorkers,
} from './ai-workers.ts';
import {
    getWorkerStates,
} from './state-events.ts';

export {
    SystemWorker,
    isHumanWorker,
    isAIWorker,
    isSystemWorker,
} from '../../../api/types.ts';
export type {
    Worker,
} from '../../../api/types.ts';

// The system worker has no detail row — it is a parent
// row (type 'system') plus its lifecycle state. Read it
// here so getWorkerMap can resolve a system-authored
// event's author; getWorkers (the roster) omits it.
async function getSystemWorkers(
    ctx: RequestContext,
): Promise<SystemWorker[]> {
    const [parents, stateMap] = await Promise.all([
        ctx.GET<WorkerEntity[]>('workers'),
        getWorkerStates(ctx),
    ]);
    const out: SystemWorker[] = [];
    for (const parent of parents) {
        if (parent.type !== 'system') continue;
        const state = stateMap.get(parent.id);
        if (state === undefined) {
            throw new Error(
                'no state event for system worker '
                + parent.id,
            );
        }
        out.push(new SystemWorker(parent, state));
    }
    return out;
}

export async function getWorkers(
    ctx: RequestContext,
): Promise<Worker[]> {
    const [humans, ais] = await Promise.all([
        getHumanWorkers(ctx),
        getAIWorkers(ctx),
    ]);
    return [...humans, ...ais];
}

// Resolve every worker by id for name display. Unlike
// getWorkers (the roster), this includes the system
// worker so a system-authored event's author resolves
// rather than throwing.
export async function getWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, Worker>> {
    const [workers, system] = await Promise.all([
        getWorkers(ctx),
        getSystemWorkers(ctx),
    ]);
    return new Map(
        [...workers, ...system].map(
            worker => [worker.idForLink(), worker],
        ),
    );
}

export function workerName(
    workerMap: Map<WorkerId, Worker>,
    workerId: WorkerId,
): string {
    const worker = workerMap.get(workerId);
    if (!worker) {
        throw new Error(
            'workerName: unknown worker '
            + workerId,
        );
    }
    return worker.name();
}
