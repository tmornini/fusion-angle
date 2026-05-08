import { nowUtc } from '../../../api/types.ts';
import {
    isActivityType,
} from '../../../api/types.ts';
import type {
    ActivityType,
} from '../../../api/types.ts';
import { getCurrentPersonRow } from './shared.ts';
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
    ctx: FetchContext,
    input: ActivityInput,
): Promise<void> {
    const personRow =
        await getCurrentPersonRow(ctx);
    const activityId =
        generateCryptoSafeBase62();
    const actorId = generateCryptoSafeBase62();
    const timestamp = nowUtc();
    await ctx.PUT(
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
    await ctx.PUT(
        `activity-actors/${actorId}`,
        {
            activity_id: activityId,
            person_id: personRow.id,
            created_at: timestamp,
        },
    );
}
