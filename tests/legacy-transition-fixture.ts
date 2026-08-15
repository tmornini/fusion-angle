import type { DbAdapter } from '../api/db.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWritePair,
} from '../api/message-pair.ts';
import {
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

// Task 8 CUT: live gate rejects fieldValues. Census pins
// that need a STORED legacy fold seed via the below-facade
// dual-tolerant path (organization === undefined).

const PATTERN = 'work-orders/:id/transition';

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
        'work-orders', workOrderId, 'transition',
    ];
    const requestAt = opts.requestAt
        ?? (typeof body['transitionAt'] === 'string'
            ? body['transitionAt'] as string
            : new Date().toISOString());
    const actor = opts.actor ?? SYSTEM_MEMBER_ID;
    const pair = await formWritePair({
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
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, workOrderId, body, actor,
        undefined, [], pair,
    );
}
