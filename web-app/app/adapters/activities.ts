import { PUT } from '../../../api/api';
import { nowUtc } from '../../../api/types';
import {
    isActivityType,
} from '../../../api/types';
import type {
    ActivityType,
} from '../../../api/types';
import { getCurrentUser } from './shared';

export {
    isActivityType,
    isDimensionKey,
} from '../../../api/types';
export type {
    ActivityType,
    DimensionKey,
} from '../../../api/types';

export interface ActivityInput {
    type: ActivityType;
    action: string;
    target: string;
    status: string;
    feedback: string;
}

export async function postActivity(
    input: ActivityInput,
): Promise<void> {
    const auth = await getCurrentUser();
    const activityId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
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
            user_id: auth.user.idForLink(),
            created_at: timestamp,
        },
    );
}
