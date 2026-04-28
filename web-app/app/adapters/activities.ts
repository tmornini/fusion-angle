import { PUT } from '../../../api/api.ts';
import { nowUtc } from '../../../api/types.ts';
import {
    isActivityType,
} from '../../../api/types.ts';
import type {
    ActivityType,
} from '../../../api/types.ts';
import { getCurrentUserRow } from './shared.ts';
import type { FetchContext } from './shared.ts';
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
    input: ActivityInput,
    ctx?: FetchContext,
): Promise<void> {
    const userRow =
        await getCurrentUserRow(ctx);
    const activityId = generateCryptoSafeBase62();
    const actorId = generateCryptoSafeBase62();
    const timestamp = nowUtc();
    await PUT(
        `activities/${activityId}`,
        {
            type: input.type,
            action: input.action,
            target: input.target,
            timestamp,
            status: input.status,
            feedback: input.feedback,
        },
    );
    await PUT(
        `activity-actors/${actorId}`,
        {
            activity_id: activityId,
            user_id: userRow.id,
            created_at: timestamp,
        },
    );
}
