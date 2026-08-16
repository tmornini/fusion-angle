import type { DbAdapter } from './db.ts';
import type {
    Id, IdentityDefaultOrganizationEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
} from './derive-documents.ts';

// Task 53: the SET default-organization document lives at
// /identities/:id/default-organization/ — a singleton
// (uriId '') like identities/:id/pii. GET returns that
// document or 404; token resolution is a separate read.
function defaultOrganizationPrefix(identityId: Id): string {
    return '/identities/' + identityId
        + '/default-organization/';
}

// The current SET document, or empty when never written.
// Head-reduced (deriveDocumentsAt): a later PUT at the same
// address is the document. TARGETED read: one identity-keyed
// prefix via the uri_collection index.
export async function deriveDefaultOrganization(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityDefaultOrganizationEntity[]> {
    const prefix = defaultOrganizationPrefix(identityId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_collection', prefix),
        db.responses.getAllWhere('uri_collection', prefix),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get('');
    if (document === undefined) return [];
    const head = documentPairsAt(
        requests, responses, prefix,
    ).find((pair) => pair.id === document.pairId);
    return [{
        id: identityId,
        identity_id: identityId,
        organization_id:
            pickString(document.body, 'organization_id'),
        at: head === undefined ? '' : head.at,
    }];
}
