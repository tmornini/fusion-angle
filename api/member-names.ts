import type { DbAdapter } from './db.ts';
import {
    SYSTEM_MEMBER_ID,
    SYSTEM_MEMBER_NAME,
    type Id,
} from '../shared/types.ts';
import { canonicalPath } from './message-pair.ts';
import { pickString } from './validators.ts';
import {
    isDeletedHead,
    selectHeadsAtPath,
    type HeadSelection,
} from './head-reads.ts';
import { servedBodyOf } from './served-response.ts';
import { selectOrganizationMemberships } from
    './invitations-domain.ts';

// The name each member id has under the GETs that serve it
// to any member of the organization: a person's name from
// the memberships GET's join (accepted and removed seats;
// an erased name is not joined), an AI's or a service's
// from its ai-agents/:id or services/:id document, and the
// system member's own. A member with no readable name is
// absent.
export async function memberNamesOf(
    db: DbAdapter,
    organization: Id,
): Promise<ReadonlyMap<Id, string>> {
    const [accepted, removed, agents, services] =
        await Promise.all([
            selectOrganizationMemberships(
                db, organization,
                { kind: 'state', state: 'accepted' },
            ),
            selectOrganizationMemberships(
                db, organization,
                { kind: 'state', state: 'removed' },
            ),
            selectHeadsAtPath(
                db, canonicalPath(organization, '/ai-agents/'),
                'stateless',
            ),
            selectHeadsAtPath(
                db, canonicalPath(organization, '/services/'),
                'stateless',
            ),
        ]);
    return new Map([
        ...personNamesOf(accepted),
        ...personNamesOf(removed),
        ...documentNamesOf(agents),
        ...documentNamesOf(services),
        [SYSTEM_MEMBER_ID, SYSTEM_MEMBER_NAME],
    ]);
}

function servedBodiesOf(
    selection: HeadSelection,
): Record<string, unknown>[] {
    if (selection.kind !== 'collection') {
        throw new Error(
            'member names read a collection, not a '
                + selection.kind,
        );
    }
    return selection.heads
        .filter((head) => !isDeletedHead(head, selection.lifecycle))
        .map((head) => servedBodyOf(head, selection.reader));
}

// The join carries invitee_name only for a live, non-empty
// name, so its absence is the name's.
function personNamesOf(
    memberships: HeadSelection,
): [Id, string][] {
    return servedBodiesOf(memberships).flatMap((body) => {
        const name = body['invitee_name'];
        return body['identity_kind'] === 'person'
                && typeof name === 'string'
            ? [[pickString(body, 'identity_id'), name]]
            : [];
    });
}

// A member document's id is its member's identity id.
function documentNamesOf(
    documents: HeadSelection,
): [Id, string][] {
    return servedBodiesOf(documents).map((body) => [
        pickString(body, 'id'), pickString(body, 'name'),
    ]);
}
