import { nowUtc } from '../../../api/types.ts';
import {
    isActivityType,
} from '../../../api/types.ts';
import type {
    ActivityType,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getCurrentHumanWorker,
} from './workers.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

export {
    isActivityType,
    isDimensionKey,
} from '../../../api/types.ts';
export type {
    ActivityType,
    DimensionKey,
} from '../../../api/types.ts';

export interface ActivityInput {
    type: ActivityType;
    action: string;
    target: string;
    status: string;
    feedback: string;
}

export async function postActivity(
    ctx: RequestContext,
    input: ActivityInput,
): Promise<void> {
    const workerRow =
        await getCurrentHumanWorker(ctx);
    const activityId =
        generateCryptoSafeBase62();
    const actorId = generateCryptoSafeBase62();
    const timestamp = nowUtc();
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `activities/${activityId}`,
                body: {
                    type: input.type,
                    action: input.action,
                    target: input.target,
                    timestamp,
                    status: input.status,
                    feedback: input.feedback,
                },
            },
            {
                method: 'put',
                resource:
                    `activity-actors/${actorId}`,
                body: {
                    activity_id: activityId,
                    person_id: workerRow.id,
                    created_at: timestamp,
                },
            },
        ],
    });
}
