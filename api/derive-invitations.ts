import type { DbAdapter } from './db.ts';
import type { Id, InvitationState } from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
} from './derive-documents.ts';

// The invitation family's own reduction over the message
// ledger — the roster phase's LAST derivation before the
// readers flip (Task 8). The invitation ROW comes from the
// grant's document head at the flat '/invitations/' address
// (ONE keyed getAllWhere read per store — deriveDocumentsAt);
// its STATE comes from a SEPARATE reduction this module owns,
// since an invitation's lifecycle never rides the document
// address (Decision 6 would require a trio the wire body has
// no room for — the invitations side channel forms its
// operation pairs at 'invitations/:id/acceptance' etc,
// api/invitations-domain.ts's formInvitationOpPair).
//
// E13 FULL-SCAN NAMED CLASS: no index can serve "every request
// whose uri_prefix has the shape /invitations/<id>/<op>/" for an
// arbitrary id, so invitationOpStates below reads db.requests.
// getAll() — ONE full table scan, regardless of how many
// invitations exist. Grown alongside every future full-ledger
// scan; its measured cost is recorded at the Task 9 CLI leg,
// not here.
//
// Mutual exclusivity of the three op states is the domain
// gate's own covenant (grantInvitation/acceptInvitation/
// declineInvitation/revokeInvitation each require 'pending' to
// succeed; a conflict appends nothing), never re-derived here —
// an id can accumulate repeat pairs of only ONE op kind.

const INVITATIONS_PREFIX = canonicalUriPrefix(
    undefined, '/invitations/',
);

const OP_STATES: Readonly<Record<string, InvitationState>> = {
    acceptance: 'accepted',
    decline: 'declined',
    revocation: 'revoked',
};

const OP_ADDRESS_PATTERN =
    /^\/invitations\/([^/]+)\/(acceptance|decline|revocation)\/$/;

export interface DerivedInvitationRow {
    readonly id: Id;
    readonly organization_id: Id;
    readonly identity_id: Id;
    readonly at: string;
    readonly state: InvitationState;
}

// The E13 full-scan: every invitation id that has EVER reached
// a terminal/answering op, mapped to the state that op proves.
// 409s append nothing (the domain gate's own guard), so scanning
// requests alone — never cross-checking responses for status —
// is sound: every pair found here IS a genuine 2xx.
async function invitationOpStates(
    db: DbAdapter,
): Promise<Map<Id, InvitationState>> {
    const states = new Map<Id, InvitationState>();
    for (const request of await db.requests.getAll()) {
        const match = OP_ADDRESS_PATTERN.exec(request.uri_prefix);
        if (match === null) continue;
        const state = OP_STATES[match[2]!];
        if (state === undefined) continue;
        states.set(match[1]!, state);
    }
    return states;
}

// Reads db.requests/db.responses ONLY. invitationsForInvitee and
// sentInvitations derive their rows + state through this; the
// enrichment joins (organization/pii) stay old-plane reads.
export async function deriveInvitations(
    db: DbAdapter,
): Promise<DerivedInvitationRow[]> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', INVITATIONS_PREFIX),
        db.responses.getAllWhere(
            'uri_prefix', INVITATIONS_PREFIX,
        ),
    ]);
    const documents = deriveDocumentsAt(
        requests, responses, INVITATIONS_PREFIX,
    );
    const opStates = await invitationOpStates(db);
    const rows: DerivedInvitationRow[] = [];
    for (const [id, document] of documents) {
        rows.push({
            id,
            organization_id: pickString(
                document.body, 'organization_id',
            ),
            identity_id: pickString(
                document.body, 'identity_id',
            ),
            at: pickString(document.body, 'at'),
            state: opStates.get(id) ?? 'pending',
        });
    }
    return rows.sort(byIdAscending);
}
