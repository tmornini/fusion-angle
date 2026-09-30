import type { DbAdapter } from '../api/db.ts';
import {
    postSeedWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    SYSTEM_MEMBER_ID,
} from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Task 8 CUT: live gate rejects fieldValues. Census pins
// that need a STORED legacy fold seed via the below-facade
// dual-tolerant seed op.

const PATTERN = 'organizations/:id/work-orders/:id/transition';

export async function appendLegacyTransition(
    db: DbAdapter,
    organization: string,
    workOrderId: string,
    body: Record<string, unknown>,
    opts: {
        actor?: string;
        requestAt?: string;
    } = {},
): Promise<void> {
    const pathSegments = [
        'organizations', organization,
        'work-orders', workOrderId, 'transition',
    ];
    const requestAt = opts.requestAt
        ?? (typeof body['transitionAt'] === 'string'
            ? body['transitionAt'] as string
            : new Date().toISOString());
    const actor = opts.actor ?? SYSTEM_MEMBER_ID;
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: PATTERN,
        routeSegments: PATTERN.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: actor,
        requestAt,
        organization,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postSeedWorkOrderTransitionOp(
        db, organization, workOrderId, body, actor, messagePair,
    );
}
