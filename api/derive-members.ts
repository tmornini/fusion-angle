import type { DbAdapter } from './db.ts';
import type { Id, MemberEntity } from '../shared/types.ts';
import { pickString } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
} from './derive-documents.ts';
import {
    membershipOfHead,
    organizationMembershipHeads,
} from './memberships.ts';

// Roster is memberships ∩ identities. Leftover /members/
// parent documents do not join. A person identity with an
// accepted membership is a human roster row; absence of
// either is not a member.

const IDENTITIES_PREFIX = canonicalPath(
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

// Roster is memberships ∩ person identities. Leftover
// /members/ parent documents do not join. System is not
// a membership.
export async function deriveMembers(
    db: DbAdapter,
    organization: Id,
): Promise<MemberEntity[]> {
    const [heads, identityMessagePairs] = await Promise.all([
        organizationMembershipHeads(db, organization, {
            kind: 'state',
            state: 'accepted',
        }),
        db.messagePairs.getCollectionPairs(IDENTITIES_PREFIX,
        ),
    ]);
    const identities = deriveDocumentsAt(
        identityMessagePairs, IDENTITIES_PREFIX,
    );
    const rows: MemberEntity[] = [];
    for (const head of heads) {
        const membership = membershipOfHead(head);
        const identity = identities.get(membership.identity_id);
        if (identity === undefined) continue;
        if (pickString(identity.body, 'kind') !== 'person') {
            continue;
        }
        rows.push(seatedHumanOf(membership.identity_id));
    }
    return rows.sort(byIdAscending);
}
