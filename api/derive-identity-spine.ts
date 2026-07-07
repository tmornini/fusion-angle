import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id,
    ResponseEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityCredentialKind,
    IdentityCredentialStatus,
    RoleGrantEntity,
    RoleGrantAction,
    IdentityProviderEntity,
    IdentityProviderAction,
    IdentityTokenRevocationEntity,
} from './types.ts';
import { pickString } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// The identity spine's own reduction over the message ledger —
// Phase 10 Task 7, the roster phase's LAST derivation before the
// readers flip (Task 8). Five facets, four shapes:
//
// E13 FULL-SCAN NAMED CLASS (derive-invitations.ts's own named
// class): '/pii' forms ONE distinct prefix PER IDENTITY
// ('/identities/<id>/pii/', uriId '' — a singleton document at a
// collection-style address, message-address.ts), so no index can
// serve "every request whose uri_prefix has this shape" for an
// arbitrary id. deriveIdentityPiiRows reads db.requests/responses
// IN FULL (ONE shared tx) and matches PII_ADDRESS_PATTERN — the
// segment-boundary rule verified against derive-invitations.ts's
// OP_ADDRESS_PATTERN at Step 0: '[^/]+' between two literal
// slashes, anchored at both ends, so '/identities/42/pii/' can
// never be confused with a sibling address sharing the
// '/identities/' root ('/identities/42/credentials/c1/', or the
// identity's own '/identities/42/' document) — the '/members' vs
// '/memberships' precedent class this task's brief names.
//
// READ SEMANTICS (concurrency lens): '/pii' is the message
// plane's ONE sanctioned hard-delete zone (api/pii-hard-delete.ts)
// — a write physically DELETES the slot's prior pair before
// appending its own. Two INDEPENDENT getAllWhere reads (one per
// store) could straddle a concurrent supersession: the first read
// captures the OLD request row, a concurrent replacePiiSlot then
// deletes it and appends a NEW pair, and the second read captures
// the NEW response row alone — the two rows never share an id, so
// deriveDocumentsAt's request/response match fails and a LIVE
// identity spuriously 404s. Both pii derives below close this by
// reading requests AND responses inside ONE shared readonly
// db.transaction(['requests', 'responses'], ...) — greenfield
// code, closed at zero cost. No other facet in this module is a
// delete zone, so none of the other reads need this — Promise.all
// outside a transaction (the deriveMembers/deriveInvitations
// precedent) is sufficient for them.
//
// GATE 16 — THE ROLE-GRANTS RESPONSE-BODY DEVIATION (a NAMED
// deviation from every other facet here): deriveRoleGrants/
// deriveRoleGrant read the stored RESPONSE body, not the request
// body. A live role-grant PUT's wire REQUEST omits organization_id
// (the client relies on it being inferred from the active
// organization — web-app/app/adapters/role-grants.ts); the
// ORG-SCOPED row-plane store stamps it at write time
// (OrganizationScopedEntityStore#stamp), and the route's OWN
// WRITE_RESPONSE_SPECS entry ('role-grants/:id', api/routes.ts)
// re-derives the SAME stamp from the verified fence organization
// into the RESPONSE body it forms and stores — so the RESPONSE,
// never the REQUEST, is the authoritative, fence-stamped row.
// Every other event-plane facet here (credentials, providers,
// revocations) carries its full entity — including identity_id —
// in the wire REQUEST already (validators.ts confirms each body-
// key list), so the deviation does not spread to them.
//
// Every function below reads db.requests/db.responses (+
// pickString over their decoded bodies) ONLY, mirroring api/
// derive-members.ts and api/derive-invitations.ts. NOTHING reads
// this module in production yet; tests/drift-identities.test.ts
// alone gates the flip Task 8 performs.
//
// Measured costs (the E13 full scan; the per-identity/per-event
// prefix reads) are recorded at Task 9's CLI leg, not here.

// ---- identity_pii — the E13 scan + the exact-prefix single-id --
// ---- read; 'pii' does not pluralize as a count noun, so the ----
// ---- one accommodation to the bare-plural/bare-singular naming -
// ---- rule is deriveIdentityPiiRows/deriveIdentityPii, never ----
// ---- deriveIdentityPiis/deriveIdentityPiiRow ---------------------

const PII_ADDRESS_PATTERN = /^\/identities\/([^/]+)\/pii\/$/;

function piiPrefixFor(identityId: Id): string {
    return canonicalUriPrefix(
        undefined, '/identities/' + identityId + '/pii/',
    );
}

// id-first, picked explicitly (pickString) rather than a body
// spread — the deriveMemberParents/deriveBaselineScores
// convention: a leaked operation-pair body reaching this
// construction throws loudly rather than silently mis-deriving.
function piiEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityPiiEntity {
    const body = document.body;
    return {
        id: identityId,
        name: pickString(body, 'name'),
        email: pickString(body, 'email'),
        phone: pickString(body, 'phone'),
        bio: pickString(body, 'bio'),
    };
}

// Every LIVE /pii slot, id-lex ordered (byIdAscending, the
// IndexedDB reference). A DELETE-head slot (an erasure tombstone)
// is silently absent — deriveDocumentsAt's own head-absence rule,
// unchanged here.
export async function deriveIdentityPiiRows(
    db: DbAdapter,
): Promise<IdentityPiiEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAll(),
                view.responses.getAll(),
            ]);
            const prefixes = new Set<string>();
            for (const request of requests) {
                if (
                    PII_ADDRESS_PATTERN.test(request.uri_prefix)
                ) {
                    prefixes.add(request.uri_prefix);
                }
            }
            const rows: IdentityPiiEntity[] = [];
            for (const prefix of prefixes) {
                const match = PII_ADDRESS_PATTERN.exec(prefix)!;
                const identityId = match[1]!;
                const document = deriveDocumentsAt(
                    requests, responses, prefix,
                ).get('');
                if (document === undefined) continue;
                rows.push(piiEntityOf(identityId, document));
            }
            return rows.sort(byIdAscending);
        },
    );
}

// The single-slot read at the identity's own exact prefix — ONE
// getAllWhere per store, both inside the SAME shared tx (the
// module header's torn-read closure). Throws
// EntityNotFoundError('identity_pii', id) on absence OR a
// DELETE-head slot (an erasure tombstone) — the 404-byte anchor
// tests/drift-identities.test.ts pins against the old plane.
export async function deriveIdentityPii(
    db: DbAdapter,
    id: Id,
): Promise<IdentityPiiEntity> {
    const prefix = piiPrefixFor(id);
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere('uri_prefix', prefix),
                view.responses.getAllWhere('uri_prefix', prefix),
            ]);
            const document = deriveDocumentsAt(
                requests, responses, prefix,
            ).get('');
            if (document === undefined) {
                throw new EntityNotFoundError(
                    'identity_pii', id,
                );
            }
            return piiEntityOf(id, document);
        },
    );
}

// ---- identity_credentials — a per-identity nested collection, --
// ---- the deriveBaselineScores/deriveActualScores precedent -----
// ---- (api/derive-project-scores.ts) ------------------------------

function credentialsPrefixFor(identityId: Id): string {
    return canonicalUriPrefix(
        undefined,
        '/identities/' + identityId + '/credentials/',
    );
}

// FULL rows from the REQUEST body — the secret rides the request,
// unlike role-grants (gate 16 above); the route projects
// withoutSecret at read time, not here.
function credentialEntityOf(
    document: DerivedDocument,
): IdentityCredentialEntity {
    const body = document.body;
    return {
        id: document.uriId,
        identity_id: pickString(body, 'identity_id'),
        kind: pickString(body, 'kind') as IdentityCredentialKind,
        status:
            pickString(body, 'status') as IdentityCredentialStatus,
        secret: pickString(body, 'secret'),
        at: pickString(body, 'at'),
    };
}

async function fetchCredentialDocuments(
    db: DbAdapter,
    identityId: Id,
): Promise<Map<string, DerivedDocument>> {
    const prefix = credentialsPrefixFor(identityId);
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    return deriveDocumentsAt(requests, responses, prefix);
}

// id-lex ordered. Pairs at the exact credentials prefix;
// latest-per-uriId (deriveDocumentsAt) — a re-PUT of the same cid
// overwrites, matching the row plane's own put() semantics.
export async function deriveCredentialsFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityCredentialEntity[]> {
    const documents =
        await fetchCredentialDocuments(db, identityId);
    const rows: IdentityCredentialEntity[] = [];
    for (const document of documents.values()) {
        rows.push(credentialEntityOf(document));
    }
    return rows.sort(byIdAscending);
}

export async function deriveCredential(
    db: DbAdapter,
    identityId: Id,
    cid: Id,
): Promise<IdentityCredentialEntity> {
    const documents =
        await fetchCredentialDocuments(db, identityId);
    const document = documents.get(cid);
    if (document === undefined) {
        throw new EntityNotFoundError(
            'identity_credentials', cid,
        );
    }
    return credentialEntityOf(document);
}

// ---- role_grants — the gate 16 response-body deviation ----------

const ROLE_GRANTS_PREFIX =
    canonicalUriPrefix(undefined, '/role-grants/');

// A stored message's JSON body, response side — requestBodyOf's
// twin (api/derive-documents.ts), needed here ONLY because gate 16
// reads the response, never the request.
function responseBodyOf(message: string): Record<string, unknown> {
    const model = parseJson(message, defaultBodyRegistry());
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

function roleGrantEntityOf(
    document: DerivedDocument,
    responseBody: Record<string, unknown>,
): RoleGrantEntity {
    return {
        id: document.uriId,
        organization_id:
            pickString(responseBody, 'organization_id'),
        identity_id: pickString(responseBody, 'identity_id'),
        role: pickString(responseBody, 'role'),
        action: pickString(responseBody, 'action') as
            RoleGrantAction,
        by_member_id: pickString(responseBody, 'by_member_id'),
        at: pickString(responseBody, 'at'),
    };
}

async function fetchRoleGrantDocuments(
    db: DbAdapter,
): Promise<{
    documents: Map<string, DerivedDocument>;
    responseById: Map<Id, ResponseEntity>;
}> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere(
            'uri_prefix', ROLE_GRANTS_PREFIX,
        ),
        db.responses.getAllWhere(
            'uri_prefix', ROLE_GRANTS_PREFIX,
        ),
    ]);
    return {
        documents: deriveDocumentsAt(
            requests, responses, ROLE_GRANTS_PREFIX,
        ),
        responseById: new Map(
            responses.map((response) => [response.id, response]),
        ),
    };
}

// document.pairId IS a responses.id already matched by
// deriveDocumentsAt's own reduction over the SAME responses array
// — the lookup below cannot miss; `!` names an internal
// invariant, not a distrust of validated storage.
function roleGrantFromDocument(
    document: DerivedDocument,
    responseById: Map<Id, ResponseEntity>,
): RoleGrantEntity {
    const response = responseById.get(document.pairId)!;
    return roleGrantEntityOf(
        document, responseBodyOf(response.message),
    );
}

// Heads at '/role-grants/', id-lex ordered; latest-per-uriId.
export async function deriveRoleGrants(
    db: DbAdapter,
): Promise<RoleGrantEntity[]> {
    const { documents, responseById } =
        await fetchRoleGrantDocuments(db);
    const rows: RoleGrantEntity[] = [];
    for (const document of documents.values()) {
        rows.push(roleGrantFromDocument(document, responseById));
    }
    return rows.sort(byIdAscending);
}

export async function deriveRoleGrant(
    db: DbAdapter,
    id: Id,
): Promise<RoleGrantEntity> {
    const { documents, responseById } =
        await fetchRoleGrantDocuments(db);
    const document = documents.get(id);
    if (document === undefined) {
        throw new EntityNotFoundError('role_grants', id);
    }
    return roleGrantFromDocument(document, responseById);
}

// ---- identity_providers — same event-plane shape, REQUEST body -

const IDENTITY_PROVIDERS_PREFIX =
    canonicalUriPrefix(undefined, '/identity-providers/');

function identityProviderEntityOf(
    document: DerivedDocument,
): IdentityProviderEntity {
    const body = document.body;
    return {
        id: document.uriId,
        identity_id: pickString(body, 'identity_id'),
        provider: pickString(body, 'provider'),
        provider_subject: pickString(body, 'provider_subject'),
        action: pickString(body, 'action') as
            IdentityProviderAction,
        at: pickString(body, 'at'),
    };
}

async function fetchIdentityProviderDocuments(
    db: DbAdapter,
): Promise<Map<string, DerivedDocument>> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere(
            'uri_prefix', IDENTITY_PROVIDERS_PREFIX,
        ),
        db.responses.getAllWhere(
            'uri_prefix', IDENTITY_PROVIDERS_PREFIX,
        ),
    ]);
    return deriveDocumentsAt(
        requests, responses, IDENTITY_PROVIDERS_PREFIX,
    );
}

export async function deriveIdentityProviders(
    db: DbAdapter,
): Promise<IdentityProviderEntity[]> {
    const documents = await fetchIdentityProviderDocuments(db);
    const rows: IdentityProviderEntity[] = [];
    for (const document of documents.values()) {
        rows.push(identityProviderEntityOf(document));
    }
    return rows.sort(byIdAscending);
}

export async function deriveIdentityProvider(
    db: DbAdapter,
    id: Id,
): Promise<IdentityProviderEntity> {
    const documents = await fetchIdentityProviderDocuments(db);
    const document = documents.get(id);
    if (document === undefined) {
        throw new EntityNotFoundError('identity_providers', id);
    }
    return identityProviderEntityOf(document);
}

// ---- identity_token_revocations — same event-plane shape, ------
// ---- REQUEST body; no live collection route exists for this ----
// ---- family (unlike role-grants/identity-providers), so only ---
// ---- the by-id derivation is named here -------------------------

const IDENTITY_TOKEN_REVOCATIONS_PREFIX = canonicalUriPrefix(
    undefined, '/identity-token-revocations/',
);

function tokenRevocationEntityOf(
    document: DerivedDocument,
): IdentityTokenRevocationEntity {
    return {
        id: document.uriId,
        identity_id: pickString(document.body, 'identity_id'),
        at: pickString(document.body, 'at'),
    };
}

export async function deriveTokenRevocation(
    db: DbAdapter,
    id: Id,
): Promise<IdentityTokenRevocationEntity> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere(
            'uri_prefix', IDENTITY_TOKEN_REVOCATIONS_PREFIX,
        ),
        db.responses.getAllWhere(
            'uri_prefix', IDENTITY_TOKEN_REVOCATIONS_PREFIX,
        ),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, IDENTITY_TOKEN_REVOCATIONS_PREFIX,
    ).get(id);
    if (document === undefined) {
        throw new EntityNotFoundError(
            'identity_token_revocations', id,
        );
    }
    return tokenRevocationEntityOf(document);
}
