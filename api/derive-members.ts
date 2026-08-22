import type { DbAdapter } from './db.ts';
import type { Id, MemberEntity } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
} from './derive-documents.ts';
import {
    deriveOrganizationMemberSeats,
} from './derive-memberships.ts';

// Roster is seats ∩ identities. Leftover /members/ parent
// documents do not join. A person identity with a live seat
// is a human roster row; absence of either is not a member.

const IDENTITIES_PREFIX = canonicalUriCollection(
    undefined, '/identities/',
);

function seatedHumanOf(
    identityId: Id,
): MemberEntity {
    return {
        id: identityId,
        type: 'human',
    };
}

// Roster is seats ∩ person identities. Leftover /members/
// parent documents do not join. System is not a seat.
export async function deriveMembers(
    db: DbAdapter,
    organization: Id,
): Promise<MemberEntity[]> {
    const [seats, identityMessagePairs] = await Promise.all([
        deriveOrganizationMemberSeats(db, organization),
        db.messagePairs.getAllWhere(
            'uri_collection', IDENTITIES_PREFIX,
        ),
    ]);
    const identities = deriveDocumentsAt(
        identityMessagePairs, IDENTITIES_PREFIX,
    );
    const rows: MemberEntity[] = [];
    for (const seat of seats) {
        const identity = identities.get(seat.identity_id);
        if (identity === undefined) continue;
        if (pickString(identity.body, 'kind') !== 'person') {
            continue;
        }
        rows.push(seatedHumanOf(seat.identity_id));
    }
    return rows.sort(byIdAscending);
}
