import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, MembershipEntity } from './types.ts';
import {
    validateSeatDocumentBody,
} from './validators.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    type DerivedDocument,
} from './derive-documents.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';

// The membership ledger's own reduction — Phase 13 Task 2, the
// auth/authz/session spine's membership derivation. NOTHING reads
// this module in production yet (Task 3 flips the per-request
// authz fence onto it); this task lands the derivation plus its
// own drift gate (tests/drift-memberships-identity.test.ts) alone.
//
// memberships is ORGANIZATION-NESTED (family-registry.ts), unlike
// organizations/members/identities' GLOBAL plane, so there is no
// single flat prefix to scan for "every membership an identity
// holds" — an identity can join MULTIPLE organizations at once
// (the seed's own 'XXZruirZyAOoRpNxaDnpSA', both STARK and ORGANIZATION_TWO).
// deriveMembershipsForIdentity is therefore ENUMERATE-THEN-PROBE:
// deriveOrganizations(db) (api/derive-organizations.ts) enumerates
// every LIVE organization, then this walks each organization's
// own '/organizations/<oid>/members/' prefix in turn —
// EXHAUSTIVE, never short-circuited, unlike
// organizationHasMemberMessagePair's own co-membership
// fast path (api/derive-states.ts): that
// function answers "does this identity belong to ONE named
// organization," this answers "every organization it belongs to,"
// so every organization must be probed regardless of an early
// hit. The full-scan alternative (a single getAllWhere over every
// memberships row) was REJECTED for this hot path: getAllWhere is
// equality-only against ONE indexed column, and the message
// ledger's own uri_collection index never carries identity_id — from
// Task 5 on, every facade hop grows the ledger further, so a scan
// widening with the WHOLE ledger's history is the wrong shape for
// a per-identity read that recurs on every fenced request.
//
// HEAD-REDUCED (deriveDocumentsAt), not raw pairs: a membership
// REMOVAL is a genuine hard row-DELETE — no states-log soft-
// delete event exists for memberships (MEMBERSHIPS_WIRING's own
// 'stateless' lifecycle) — so a DELETE-head pair excludes the row
// here exactly as organizationHasMemberMessagePair's own
// comment establishes for the SAME prefix shape.
//
// THE ENTITY SHAPE mirrors membershipDocumentEntityOf's own
// spread (api/routes.ts) byte-for-byte, but reconstructs it
// through validateMembershipEntity instead of a raw spread — the
// derive-organizations.ts precedent (organizationEntityOf): the
// stored body carries EXACTLY {organization_id, identity_id, at}
// (MEMBERSHIP_BODY_KEYS), so re-running the SAME validator the
// live PUT already ran is the DRY, precisely-typed reconstruction,
// never a second re-list of the three field names. Trusted, not
// re-checked (Article of Faith: once data has crossed validation,
// trust it completely) — this is reconstruction, not a downstream
// defensive re-check.
//
// withoutId FIRST, always (the organizationEntityOf precedent,
// re-confirmed here after a Fable review Critical): PUT
// organizations/:organization-id/members/:identity-id is the
// LIVE seat write (not leftover memberships/:id), and
// documentWriteResponseSpec's own validateDocument call tolerates
// a stray `id` for the RESPONSE ONLY
// (`wiring.validateDocument(withoutId(body ?? {}))`, api/document-
// family.ts) — formWriteMessagePair still stores the caller's
// RAW body verbatim in the ledger (api/api.ts). The
// fetch-edit-PUT client pattern (a GET response's own
// `id` echoed back into a later PUT) therefore lands a
// STORED body carrying `id` even though
// the live write itself succeeds. validateMembershipEntity's
// assertOnlyKeys rejects an unknown key unconditionally, so
// skipping withoutId here would throw INSIDE the per-organization
// document loop, before the identity filter — one echoed-id row
// poisons deriveMembershipsForIdentity for EVERY identity sharing
// that row's organization. tests/drift-memberships-identity.
// test.ts leg 9 pins this against a LIVE echoed-id PUT.
//
// THE OUTPUT ORDER IS DEFINED, NOT ACCIDENTAL (Author gate 1):
// `at` ASCENDING with an id tiebreak — join chronology. This
// derivation's own per-organization reads run over DIFFERENT
// prefixes combined into one array — there is no single "the"
// order to inherit. The seam promises rows, never an order.
// subjectOrganizations (api/authentication.ts) feeds the JWT
// `orgs` claim from this derivation's future replacement (Task
// 3), so a byte-stable order matters to the token's own bytes;
// tests/drift-memberships-identity.test.ts pins the defined order
// explicitly.
//
// membershipExistsFor is the SINGLE-organization sibling probe:
// the grantOutcomeFor precedent (api/invitations-domain.ts) needs
// only presence, never the full row set, so it stays its own
// function rather than a `.length > 0` call over
// deriveMembershipsForIdentity filtered to one organization —
// ADAPTER-SHAPED (`dbOrView: DbAdapter`, the SAME type an open
// db.transaction view carries) so the invitation grant's own open
// transaction (which already declares MESSAGE_TABLES
// among its tables) can call it in-tx without opening a nested
// transaction of its own.
//
// Reads db.messagePairs (+ pickString/validate-
// MembershipEntity over their decoded bodies) ONLY — never
// db.memberships, the row-plane table Task 3 retires this
// derivation to replace.

export function seatsPrefixFor(organization: Id): string {
    return '/organizations/' + organization + '/members/';
}

export function seatEntityOf(
    document: DerivedDocument,
    organization: Id,
): MembershipEntity {
    const body = validateSeatDocumentBody(
        withoutId(document.body),
    );
    return {
        id: document.uriId,
        organization_id: organization,
        identity_id: document.uriId,
        type: body.type,
        at: body.at,
    };
}

function byAtThenIdAscending(
    a: MembershipEntity, b: MembershipEntity,
): number {
    return a.at < b.at ? -1
        : a.at > b.at ? 1
            : compareIdentifiers(a.id, b.id);
}

// Every LIVE membership row naming `identityId`, across EVERY
// organization — ascending by (at, id) (the defined order, see
// above). An identity with no membership at all (a genuine
// orphan, or an unknown id) returns an empty array; it never
// throws.
export async function deriveMembershipsForIdentity(
    db: DbAdapter,
    identityId: Id,
): Promise<MembershipEntity[]> {
    const organizations = await deriveOrganizations(db);
    const rows: MembershipEntity[] = [];
    for (const organization of organizations) {
        const seatPrefix = seatsPrefixFor(organization.id);
        const seatMessagePairs = await db.messagePairs.getAllWhere(
            'uri_collection', seatPrefix,
        );
        const seat = deriveDocumentsAt(
            seatMessagePairs, seatPrefix,
        ).get(identityId);
        if (seat !== undefined) {
            rows.push(seatEntityOf(seat, organization.id));
        }
    }
    return rows.sort(byAtThenIdAscending);
}

// ONE organization's membership-presence probe, message-plane —
// the organizationHasMemberMessagePair shape
// (api/derive-states.ts), generalized to accept an
// already-open transaction view. Returns as soon as a
// LIVE membership naming `identityId` is found at
// `organization`'s own prefix; there is only one organization to
// probe, so no exhaustive union is needed here (contrast
// deriveMembershipsForIdentity above).
export async function membershipExistsFor(
    dbOrView: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<boolean> {
    const seatPrefix = seatsPrefixFor(organization);
    const seatMessagePairs =
        await dbOrView.messagePairs.getAllWhere(
            'uri_collection', seatPrefix,
        );
    return deriveDocumentsAt(
        seatMessagePairs, seatPrefix,
    ).has(identityId);
}

export async function deriveOrganizationMemberSeats(
    db: DbAdapter,
    organization: Id,
): Promise<MembershipEntity[]> {
    const prefix = seatsPrefixFor(organization);
    const messagePairs = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    const documents = deriveDocumentsAt(messagePairs, prefix);
    const rows: MembershipEntity[] = [];
    for (const document of documents.values()) {
        rows.push(seatEntityOf(document, organization));
    }
    return rows.sort(byAtThenIdAscending);
}

export async function deriveOrganizationMemberSeat(
    db: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<MembershipEntity> {
    const prefix = seatsPrefixFor(organization);
    const messagePairs = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    const document = deriveDocumentsAt(
        messagePairs, prefix,
    ).get(identityId);
    if (document === undefined) {
        throw new EntityNotFoundError(
            'organization_members', identityId,
        );
    }
    return seatEntityOf(document, organization);
}
