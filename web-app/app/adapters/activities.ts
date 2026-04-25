import { PUT } from '../../../api/api';
import { nowUtc } from '../../../api/types';
import { getCurrentUser } from './shared';

export type ActivityType =
    | 'idea_created'
    | 'project_created'
    | 'user_joined'
    | 'status_changed'
    | 'idea_converted';

export interface ActivityInput {
    type: ActivityType;
    action: string;
    target: string;
    comment?: string;
    score?: number;
    status?: string;
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
            score: input.score ?? 0,
            status: input.status ?? 'active',
            comment: input.comment ?? '',
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
