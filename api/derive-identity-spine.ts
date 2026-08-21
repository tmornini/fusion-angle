import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from './db.ts';
import type {
    Id,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityCredentialKind,
    IdentityCredentialStatus,
    IdentityProviderEntity,
    IdentityTokenRevocationEntity,
    ClientRegistrationEntity,
    IdentityKind,
} from './types.ts';
import {
    pickString,
    validateIdentityPiiEntity,
    validateClientRegistrationEntity,
    validateIdentityProviderEntity,
    validateIdentityTokenRevocationEntity,
} from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The identity spine's own reduction over the message ledger —
// Phase 10 Task 7, the roster phase's LAST derivation before the
// readers flip (Task 8). Facets (registration joined at the
// clients elimination):
//
// E13 FULL-SCAN NAMED CLASS (derive-invitations.ts's own named
// class): '/pii' forms ONE distinct prefix PER IDENTITY
// ('/identities/<id>/pii/', uriId '' — a singleton document at a
// collection-style address, message-address.ts), so no index can
// serve "every request whose uri_collection has this shape" for an
// arbitrary id. deriveIdentityPiiRows reads db.pairs
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
// appending its own. Two INDEPENDENT half-store reads could
// straddle a concurrent supersession: the first read
// captures the OLD request row, a concurrent replacePiiSlot then
// deletes it and appends a NEW pair, and the second read captures
// the NEW response row alone — the two rows never share an id, so
// deriveDocumentsAt's match fails and a LIVE
// identity spuriously 404s. Both pii derives below close this by
// reading db.pairs inside ONE shared readonly
// db.readTransaction(MESSAGE_TABLES, ...) —
// greenfield code, closed at zero cost. No other facet in this
// module is a delete zone, so none of the other reads need this
// — a prefix getAllWhere outside a transaction (the
// deriveMembers/deriveInvitations precedent) is sufficient
// for them.
//
// Role-grants RETIRED: membership `type` bakes claim roles at
// mint; Gate-16 response-body deviation deleted with the family.
//
// Every function below reads db.pairs (+
// pickString over their decoded bodies) ONLY, mirroring api/
// derive-members.ts and api/derive-invitations.ts. Production
// reads this module today: the identity facet routes
// (api/routes.ts) and api/authentication.ts.
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
    return canonicalUriCollection(
        undefined, '/identities/' + identityId + '/pii/',
    );
}

// G5: GET derive is the stored PUT. id-first via
// validateIdentityPiiEntity (withoutId first). A leaked
// operation-pair body throws rather than mis-deriving.
export function piiEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityPiiEntity {
    return {
        id: identityId,
        ...validateIdentityPiiEntity(withoutId(document.body)),
    };
}

// Every LIVE /pii slot, id-lex ordered (byIdAscending —
// the derivation's own order, never the backend's). A
// DELETE-head slot (an erasure tombstone)
// is silently absent — deriveDocumentsAt's own head-absence rule,
// unchanged here.
export async function deriveIdentityPiiRows(
    db: DbAdapter,
): Promise<IdentityPiiEntity[]> {
    return db.readTransaction(
        MESSAGE_TABLES,
        async (view) => {
            const pairs = await view.pairs.getAll();
            const prefixes = new Set<string>();
            for (const pair of pairs) {
                if (
                    PII_ADDRESS_PATTERN.test(pair.uri_collection)
                ) {
                    prefixes.add(pair.uri_collection);
                }
            }
            const rows: IdentityPiiEntity[] = [];
            for (const prefix of prefixes) {
                const match = PII_ADDRESS_PATTERN.exec(prefix)!;
                const identityId = match[1]!;
                const document = deriveDocumentsAt(
                    pairs, prefix,
                ).get('');
                if (document === undefined) continue;
                rows.push(piiEntityOf(identityId, document));
            }
            return rows.sort(byIdAscending);
        },
    );
}

// The single-slot read at the identity's own exact prefix — ONE
// getAllWhere on db.pairs, inside the SAME shared tx (the
// module header's torn-read closure). Throws
// EntityNotFoundError('identity_pii', id) on absence OR a
// DELETE-head slot (an erasure tombstone) — the 404-byte anchor
// tests/drift-identities.test.ts pins against the old plane.
export async function deriveIdentityPii(
    db: DbAdapter,
    id: Id,
): Promise<IdentityPiiEntity> {
    const prefix = piiPrefixFor(id);
    return db.readTransaction(
        MESSAGE_TABLES,
        async (view) => {
            const pairs = await view.pairs.getAllWhere(
                'uri_collection', prefix,
            );
            const document = deriveDocumentsAt(
                pairs, prefix,
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
    return canonicalUriCollection(
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
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    return deriveDocumentsAt(pairs, prefix);
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

// ---- identity_providers — nested under the identity; dual-read
// ---- the old flat prefix so leftover seed pairs still derive.

const IDENTITY_PROVIDERS_PREFIX =
    canonicalUriCollection(undefined, '/identity-providers/');

function providersPrefixFor(identityId: Id): string {
    return canonicalUriCollection(
        undefined,
        '/identities/' + identityId + '/providers/',
    );
}

export function identityProviderEntityOf(
    document: DerivedDocument,
): IdentityProviderEntity {
    return {
        id: document.uriId,
        ...validateIdentityProviderEntity(
            withoutId(document.body),
        ),
    };
}

// Nested address is the source of truth — fill or overwrite
// the request body's identity_id from the path.
function nestedProviderEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityProviderEntity {
    return identityProviderEntityOf({
        ...document,
        body: {
            ...withoutId(document.body),
            identity_id: identityId,
        },
    });
}

async function fetchProviderDocumentsAt(
    db: DbAdapter,
    prefix: string,
): Promise<Map<string, DerivedDocument>> {
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    return deriveDocumentsAt(pairs, prefix);
}

// Nested docs plus old-flat docs whose identity_id matches.
// Nested wins on the same event id.
export async function deriveIdentityProvidersFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityProviderEntity[]> {
    const nested = await fetchProviderDocumentsAt(
        db, providersPrefixFor(identityId),
    );
    const flat = await fetchProviderDocumentsAt(
        db, IDENTITY_PROVIDERS_PREFIX,
    );
    const byId = new Map<string, IdentityProviderEntity>();
    for (const document of flat.values()) {
        const entity = identityProviderEntityOf(document);
        if (entity.identity_id === identityId) {
            byId.set(entity.id, entity);
        }
    }
    for (const document of nested.values()) {
        const entity = nestedProviderEntityOf(
            identityId, document,
        );
        byId.set(entity.id, entity);
    }
    return [...byId.values()].sort(byIdAscending);
}

export async function deriveIdentityProvider(
    db: DbAdapter,
    identityId: Id,
    eid: Id,
): Promise<IdentityProviderEntity> {
    const nested = await fetchProviderDocumentsAt(
        db, providersPrefixFor(identityId),
    );
    const nestedDocument = nested.get(eid);
    if (nestedDocument !== undefined) {
        return nestedProviderEntityOf(
            identityId, nestedDocument,
        );
    }
    const flat = await fetchProviderDocumentsAt(
        db, IDENTITY_PROVIDERS_PREFIX,
    );
    const flatDocument = flat.get(eid);
    if (flatDocument !== undefined) {
        const entity = identityProviderEntityOf(flatDocument);
        if (entity.identity_id === identityId) {
            return entity;
        }
    }
    throw new EntityNotFoundError('identity_providers', eid);
}

// ---- identity_token_revocations — nested under the identity.
// ---- No collection route. No leftover flat scan: writers
// ---- are nested-only and snapshots reject the retired
// ---- prefix. Path stamps identity_id. deriveTokenRevocationsFor
// ---- is the coarse 'sign out everywhere' gate's
// ---- (tokenRevocationReason's FIRST read) one production
// ---- reader.

function tokenRevocationsPrefixFor(identityId: Id): string {
    return canonicalUriCollection(
        undefined,
        '/identities/' + identityId + '/token-revocations/',
    );
}

export function tokenRevocationEntityOf(
    document: DerivedDocument,
): IdentityTokenRevocationEntity {
    return {
        id: document.uriId,
        ...validateIdentityTokenRevocationEntity(
            withoutId(document.body),
        ),
    };
}

// Nested address is the source of truth — fill or overwrite
// the request body's identity_id from the path.
function nestedTokenRevocationEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityTokenRevocationEntity {
    return tokenRevocationEntityOf({
        ...document,
        body: {
            ...withoutId(document.body),
            identity_id: identityId,
        },
    });
}

async function fetchRevocationDocumentsFor(
    db: DbAdapter,
    identityId: Id,
): Promise<Map<string, DerivedDocument>> {
    const prefix = tokenRevocationsPrefixFor(identityId);
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    return deriveDocumentsAt(pairs, prefix);
}

export async function deriveTokenRevocationsFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityTokenRevocationEntity[]> {
    const documents = await fetchRevocationDocumentsFor(
        db, identityId,
    );
    const rows: IdentityTokenRevocationEntity[] = [];
    for (const document of documents.values()) {
        rows.push(nestedTokenRevocationEntityOf(
            identityId, document,
        ));
    }
    return rows.sort(byIdAscending);
}

export async function deriveTokenRevocation(
    db: DbAdapter,
    identityId: Id,
    id: Id,
): Promise<IdentityTokenRevocationEntity> {
    const document = (await fetchRevocationDocumentsFor(
        db, identityId,
    )).get(id);
    if (document === undefined) {
        throw new EntityNotFoundError(
            'identity_token_revocations', id,
        );
    }
    return nestedTokenRevocationEntityOf(identityId, document);
}

// ---- client_registration — the clients-table replacement: a ----
// ---- singleton document at the identity's own nested address ---
// ---- (the /pii single-slot shape: literal last segment, ------
// ---- uriId ''), Supersedes-chained like /credentials. NOT a ---
// ---- delete zone — a DELETE head is a deregistration ----------
// ---- tombstone, not an erasure — so a prefix getAllWhere -----
// ---- read shape suffices (the module header's torn-read -------
// ---- closure stays pii-only) -------------------------------------

function registrationPrefixFor(identityId: Id): string {
    return canonicalUriCollection(
        undefined,
        '/identities/' + identityId + '/registration/',
    );
}

// G5: GET derive is the stored PUT. id-first via
// validateClientRegistrationEntity (withoutId first).
export function registrationEntityOf(
    identityId: Id,
    document: DerivedDocument,
): ClientRegistrationEntity {
    return {
        id: identityId,
        ...validateClientRegistrationEntity(
            withoutId(document.body),
        ),
    };
}

// The single-slot read at the identity's exact registration
// prefix. Throws EntityNotFoundError('client_registration',
// id) on absence OR a DELETE-head slot (deregistration
// tombstone) — grantClientCredentials maps both to the same
// 401 'unknown client'.
export async function deriveClientRegistration(
    db: DbAdapter,
    identityId: Id,
): Promise<ClientRegistrationEntity> {
    const prefix = registrationPrefixFor(identityId);
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const document = deriveDocumentsAt(
        pairs, prefix,
    ).get('');
    if (document === undefined) {
        throw new EntityNotFoundError(
            'client_registration', identityId,
        );
    }
    return registrationEntityOf(identityId, document);
}

// One identity's document kind, or undefined when no identity
// document exists — the registration route's kind gate reads
// this (absent -> 404, person -> 400) before every verb. The
// whole-family prefix read is the one
// `deriveIdentityPiiRows` already makes.
export async function deriveIdentityKind(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityKind | undefined> {
    const prefix = canonicalUriCollection(
        undefined, '/identities/',
    );
    const pairs = await db.pairs.getAllWhere(
        'uri_collection', prefix,
    );
    const document = deriveDocumentsAt(
        pairs, prefix,
    ).get(identityId);
    return document === undefined
        ? undefined
        : pickString(document.body, 'kind') as IdentityKind;
}
