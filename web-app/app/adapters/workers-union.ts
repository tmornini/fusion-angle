import type {
    WorkerId,
    Worker,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getHumanWorkers,
} from './workers.ts';
import {
    getAIWorkers,
} from './ai-workers.ts';

export {
    isHumanWorker,
    isAIWorker,
} from '../../../api/types.ts';
export type {
    Worker,
} from '../../../api/types.ts';

export async function getWorkers(
    ctx: RequestContext,
): Promise<Worker[]> {
    const [humans, ais] = await Promise.all([
        getHumanWorkers(ctx),
        getAIWorkers(ctx),
    ]);
    return [...humans, ...ais];
}

export async function getWorkerMap(
    ctx: RequestContext,
): Promise<Map<WorkerId, Worker>> {
    const workers = await getWorkers(ctx);
    return new Map(
        workers.map(
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
    if (worker.kind === 'human') {
        return worker.fullName();
    }
    return worker.nameText();
}
