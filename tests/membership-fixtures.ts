import type { DbAdapter } from '../api/db.ts';
import {
    formWriteMessagePair,
    runStateWrite,
    type ParentSibling,
    type SiblingCondition,
} from '../api/message-pair.ts';
import { MEMBERSHIPS_PATH } from '../api/memberships.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import {
    SYSTEM_MEMBER_ID,
    type Id,
    type InvitationState,
    type MembershipType,
    type MessagePairEntity,
} from '../shared/types.ts';

const ITEM_ROUTE =
    'organizations/:organization-id/invitations/:membership-id';

// A membership PUT landed below the gate and below any
// mirror: no seat moves. In order on the head when one
// exists, genesis otherwise.
export async function landMembership(
    db: DbAdapter,
    organizationId: Id,
    identityId: Id,
    state: InvitationState,
    type: MembershipType,
    at: string,
): Promise<MessagePairEntity> {
    const name = membershipNameOf(organizationId, identityId);
    const body: Record<string, unknown> = {
        id: name,
        organization_id: organizationId,
        identity_id: identityId,
        type,
        state,
        at,
    };
    const head = await db.messagePairs.getHeadPair(
        MEMBERSHIPS_PATH, name,
    );
    const operationId = generateIdentifier();
    const received = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/organizations/' + organizationId
            + '/invitations/' + name,
        routePattern: ITEM_ROUTE,
        routeSegments: ITEM_ROUTE.split('/'),
        pathSegments: [
            'organizations', organizationId, 'invitations',
            name,
        ],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: at,
        organization: organizationId,
        responseBody: body,
        operationId,
        requestId: generateIdentifier(),
    });
    const condition: SiblingCondition = head === null
        ? { kind: 'genesis', declarer: 'handler' }
        : { kind: 'in-order', head: head.id };
    const sibling: ParentSibling = {
        method: 'PUT',
        path: MEMBERSHIPS_PATH,
        name,
        state: body,
        condition,
    };
    const answer = await runStateWrite(db, {
        kind: 'siblings',
        received,
        siblings: [sibling],
        reader: { sees: 'whole' },
        answer: { kind: 'parent' },
    });
    if (answer.outcome !== 'land' || answer.answeredId === null) {
        throw new Error('membership did not land');
    }
    const landed = await db.messagePairs.getHeadPair(
        MEMBERSHIPS_PATH, name,
    );
    if (landed === null || landed.id !== answer.answeredId) {
        throw new Error('membership head missing');
    }
    return landed;
}
