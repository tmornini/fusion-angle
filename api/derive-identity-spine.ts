import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
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
} from '../shared/types.ts';
import {
    pickString,
    validateIdentityPiiEntity,
    validateClientRegistrationEntity,
    validateIdentityProviderEntity,
    validateIdentityTokenRevocationEntity,
} from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The identity spine's reduction over the message ledger. The
// facets: identity_pii, identity_credentials,
// identity_providers, identity_token_revocations, and
// client_registration — each a document or a collection of
// documents under the identity's own path — plus the identity
// document's own kind.
//
// Every read below is an exact read: a collection read on one
// path, or a document read on one (path, name). Nothing here
// scans the ledger and nothing matches a path by pattern.
//
// Both pii derives read inside ONE readonly
// db.readTransaction(...). deriveIdentityPiiRows needs the
// snapshot: it lists the identities collection and then reads
// one document per id, and only one snapshot makes the list and
// its reads agree. deriveIdentityPii is a single document read
// that no concurrent append can tear; it keeps the wrapper so
// both pii derives read the same way.
//
// Role-grants RETIRED: membership `type` bakes claim roles at
// mint; Gate-16 response-body deviation deleted with the family.
//
// Every function below reads db.messagePairs (+
// pickString over their decoded bodies) ONLY, mirroring api/
// derive-members.ts and api/derive-invitations.ts. Production
// reads this module today: the identity facet routes
// (api/routes.ts) and api/authentication.ts.

// ---- identity_pii — the identities collection lists the ids, --
// ---- then one document read each; 'pii' does not pluralize as -
// ---- a count noun, so the one accommodation to the bare- -------
// ---- plural/bare-singular naming rule is -----------------------
// ---- deriveIdentityPiiRows/deriveIdentityPii, never ------------
// ---- deriveIdentityPiis/deriveIdentityPiiRow ---------------------

// The PII slot is the identity's own singleton: `path =
// /identities/<id>/`, `name = pii` — the same pathname as
// PUT identities/:id/pii (message-pair.ts
// storedPathAndNameOf). One document read serves it.
const PII_DOCUMENT_NAME = 'pii';

const IDENTITIES_PREFIX = canonicalPath(
    undefined, '/identities/',
);

export function identityPrefixFor(identityId: Id): string {
    return canonicalPath(
        undefined, '/identities/' + identityId + '/',
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

// Every LIVE PII slot, id-lex: the identities collection
// lists the ids (ONE collection read), then ONE document
// read per identity — O(identities), never O(ledger). A
// DELETE-head slot (an erasure tombstone) is absent
// (deriveDocumentsAt's own head-absence rule). An identity
// with no identities/:id document has no slot to read: PII
// rides its identity. One readonly transaction so the list
// and its reads see one snapshot.
export async function deriveIdentityPiiRows(
    db: DbAdapter,
): Promise<IdentityPiiEntity[]> {
    return db.readTransaction(async (view) => {
            const identities = deriveDocumentsAt(
                await view.messagePairs.getCollectionPairs(
                    IDENTITIES_PREFIX,
                ),
                IDENTITIES_PREFIX,
            );
            const rows: IdentityPiiEntity[] = [];
            for (const identityId of identities.keys()) {
                const prefix = identityPrefixFor(identityId);
                const document = deriveDocumentsAt(
                    await view.messagePairs.getDocumentHistory(
                        prefix, PII_DOCUMENT_NAME,
                    ),
                    prefix,
                ).get(PII_DOCUMENT_NAME);
                if (document === undefined) continue;
                rows.push(piiEntityOf(identityId, document));
            }
            return rows.sort(byIdAscending);
        },
    );
}

// The single-slot read: ONE document read of (the identity's
// prefix, 'pii'). Throws EntityNotFoundError('identity_pii',
// id) on absence OR a DELETE-head slot (an erasure
// tombstone) — the 404-byte anchor
// tests/drift-identities.test.ts pins.
export async function deriveIdentityPii(
    db: DbAdapter,
    id: Id,
): Promise<IdentityPiiEntity> {
    const prefix = identityPrefixFor(id);
    return db.readTransaction(async (view) => {
            const history = await view.messagePairs.getDocumentHistory(
                prefix, PII_DOCUMENT_NAME,
            );
            const document = deriveDocumentsAt(
                history, prefix,
            ).get(PII_DOCUMENT_NAME);
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
    return canonicalPath(
        undefined,
        '/identities/' + identityId + '/credentials/',
    );
}

// FULL rows from the stored response (the wire) — the secret
// rides the wire, unlike role-grants (gate 16 above); the route
// projects withoutSecret at read time, not here.
function credentialEntityOf(
    document: DerivedDocument,
): IdentityCredentialEntity {
    const body = document.body;
    return {
        id: document.name,
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
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    return deriveDocumentsAt(messagePairs, prefix);
}

// id-lex ordered. Pairs at the exact credentials prefix;
// latest-per-name (deriveDocumentsAt) — a re-PUT of the same cid
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
    canonicalPath(undefined, '/identity-providers/');

function providersPrefixFor(identityId: Id): string {
    return canonicalPath(
        undefined,
        '/identities/' + identityId + '/providers/',
    );
}

export function identityProviderEntityOf(
    document: DerivedDocument,
): IdentityProviderEntity {
    return {
        id: document.name,
        ...validateIdentityProviderEntity(
            withoutId(document.body),
        ),
    };
}

// Nested document is the source of truth — fill or overwrite
// the stored wire's identity_id from the path.
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
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    return deriveDocumentsAt(messagePairs, prefix);
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
    return canonicalPath(
        undefined,
        '/identities/' + identityId + '/token-revocations/',
    );
}

export function tokenRevocationEntityOf(
    document: DerivedDocument,
): IdentityTokenRevocationEntity {
    return {
        id: document.name,
        ...validateIdentityTokenRevocationEntity(
            withoutId(document.body),
        ),
    };
}

// Nested document is the source of truth — fill or overwrite
// the stored wire's identity_id from the path.
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
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    return deriveDocumentsAt(messagePairs, prefix);
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
// ---- singleton document at the identity's own nested path ---
// ---- (literal last segment, name ''), Supersedes-chained -----
// ---- like /credentials. PII no longer shares that shape —
// ---- its slot is ('/identities/<id>/', 'pii'), spec ----------
// ---- 2026-09-15 § 3. NOT a delete zone — a DELETE head is a --
// ---- deregistration tombstone, not an erasure — so one -------
// ---- getCollectionPairs read of this prefix suffices (the ----
// ---- module header's readonly-transaction wrapper stays ------
// ---- pii-only) -----------------------------------------------

export function registrationPrefixFor(identityId: Id): string {
    return canonicalPath(
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
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    const document = deriveDocumentsAt(
        messagePairs, prefix,
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
// identities collection read is the one
// deriveIdentityPiiRows begins with.
export async function deriveIdentityKind(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityKind | undefined> {
    const messagePairs = await db.messagePairs.getCollectionPairs(
        IDENTITIES_PREFIX,
    );
    const document = deriveDocumentsAt(
        messagePairs, IDENTITIES_PREFIX,
    ).get(identityId);
    return document === undefined
        ? undefined
        : pickString(document.body, 'kind') as IdentityKind;
}
