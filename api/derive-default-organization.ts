import type { DbAdapter } from './db.ts';
import type {
    Id, IdentityDefaultOrganizationEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { documentPairsAt } from './derive-documents.ts';

// Task 8 (Phase 11): the default-organization read flip. An
// identity's own default-org events live at a PER-IDENTITY
// address — /identities/:id/default-org/ — mirroring
// identityDefaultOrganizationRequest's own address construction
// (api/organization-requests.ts): the eventId rides as a
// FABRICATED trailing :param segment (the live PUT's eventId is
// a BODY key; no real URL ever carries a fourth path segment),
// so the family is identity-keyed even though it is never
// organization-nested (canonicalUriPrefix never nests it — the
// route always forms the pair with organization: undefined).
function defaultOrganizationPrefix(identityId: Id): string {
    return '/identities/' + identityId + '/default-org/';
}

// The mapped rows currentDefaultOrganizationFor (api/
// authorization.ts) reduces over — that pure reducer stays
// UNCHANGED; this function only re-points its ROW SOURCE from the
// identity_default_organizations table to the message-pair ledger
// that already records every write to it. A no-op PUT resend
// (organization_id unchanged) still forms its own pair
// (identityDefaultOrganizationRequest's own comment: the pair is
// unconditional, only the ledger ROW is conditional on `changes`),
// but it always carries the SAME organization_id the identity
// already held, so including it in the reduction changes nothing
// the reducer would resolve. TARGETED read: one identity-keyed
// prefix via the existing uri_prefix index — never a full-ledger
// scan (the E13 generic-scan abomination).
export async function deriveDefaultOrganization(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityDefaultOrganizationEntity[]> {
    const prefix = defaultOrganizationPrefix(identityId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return documentPairsAt(requests, responses, prefix).map(
        (pair) => ({
            id: pair.uriId,
            identity_id: identityId,
            organization_id:
                pickString(pair.body, 'organization_id'),
            at: pickString(pair.body, 'at'),
        }),
    );
}
