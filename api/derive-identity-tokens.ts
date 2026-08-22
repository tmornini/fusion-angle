import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, IdentityTokenEntity } from './types.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The identity_tokens ledger's own reduction — Phase 13 Task 6,
// the task that discharges gate 7. A DEDICATED module rather than
// a sixth facet on api/derive-identity-spine.ts (that module's own
// header frames itself as "Five facets, four shapes" over pii/
// credentials/role_grants/providers/revocations — identity_tokens
// carries its OWN key-order subtlety, its OWN by-jti fold, and an
// adapter-shaped in-tx reader none of those five need; folding it
// in would both bloat that header's claim and mix an unrelated
// shape into it). identity_tokens is a HistoryEntityStore row
// (api/store-history-entity.ts): from Phase 13 Task 5 on, EVERY
// row-write appends its own event pair at
// 'identities/<identityId>/tokens/<rowId>'
// (api/message-pair.ts's formTokenEventMessagePair — the SAME
// address/method/response shape a real PUT
// identities/:id/tokens/:tid would store) — issued roots
// (grant, client-credentials, token-
// exchange, the org-exchange hop), rotations, and revocations ALL
// form one, so this derivation now sees every LIVE row the row
// plane does. Before Task 5 a pair-less writer would have left
// this derivation blind to rows the Tokens page still showed —
// exactly the hazard api/routes.ts's own NOT-FLIPPED comment named
// before this task retired it.
//
// THE KEY-ORDER SUBTLETY: the derived row is id-LAST —
// validateIdentityTokenEntity's return-literal order plus `id`.
// G4: GET wins. WRITE_RESPONSE_SPECS['identities/:id/tokens/:tid']
// and formTokenEventMessagePair emit this mapper, not the older
// id-first stamp. withoutId FIRST, always (the
// organizationEntityOf / deriveMembershipsForIdentity
// precedent): a synthesized event pair's request body never
// carries a stray id, but a below-facade PUT could, and
// stripping unconditionally costs nothing.
// tests/drift-identity-tokens.test.ts pins stored PUT =
// identityTokenEntityOf.
//
// EVENT-APPEND, not document-class (api/routes.ts's own route
// comment): every row id is a fresh generateIdentifier()
// mint, so in practice no address is ever revisited — but
// deriveDocumentsAt's latest-per-uriId head resolution still
// applies uniformly (the role_grants precedent), never assumed.
//
// deriveIdentityTokenEventsForJti is the by-jti fold this task
// discharges gate 7 for: tokenRevocationReason's SECOND read
// (api/authentication.ts) — isTokenRevoked treats an unknown jti
// as NOT revoked, so this fold sits on the Commandment II hot
// path; a derivation miss here fails OPEN, admitting a revoked
// session. ADAPTER-SHAPED (`dbOrView: DbAdapter`, the
// membershipExistsFor precedent, api/derive-memberships.ts) so a
// live open transaction view can call it without nesting a
// transaction of its own — Task 9a re-anchors
// rotateRefreshJti/revokeTokenChain's own IN-TX re-reads here too
// (this task flipped only their PRE-TX provisional reads plus
// tokenRevocationReason's own by-jti read). tests/drift-identity-
// tokens.test.ts ships the pre-tx-vs-in-tx PARITY leg (the
// membershipExistsFor leg-5 precedent).
//
// No internal db.transaction wrap here (unlike derive-
// organizations.ts / deriveIdentityPiiRows): identity_tokens is
// never a hard-delete zone (api/derive-identity-spine.ts's own
// header draws this line for its own siblings) — one
// getAllWhere on db.messagePairs, outside any transaction, is the
// cheaper shape every OTHER derive-identity-spine.ts facet
// but pii already uses.
//
// Reads db.messagePairs (+ pickString/validate-
// IdentityTokenEntity over their decoded bodies) ONLY — never
// db.identityTokens, the row-plane table this task's GET flip
// retired as a production READ; Phase 13 Task 9 retires the
// row-plane WRITE too (the PUT route goes pair-only), so the
// table itself carries no production traffic on either side from
// here on.

const IDENTITY_TOKENS_TABLE = 'identity_tokens';

const IDENTITY_TOKENS_FLAT_PREFIX =
    canonicalUriCollection(undefined, '/identity-tokens/');

const TOKENS_ADDRESS_PATTERN =
    /^\/identities\/([^/]+)\/tokens\/$/;

function tokensPrefixFor(identityId: Id): string {
    return canonicalUriCollection(
        undefined,
        '/identities/' + identityId + '/tokens/',
    );
}

export function identityTokenEntityOf(
    document: DerivedDocument,
): IdentityTokenEntity {
    return {
        ...validateIdentityTokenEntity(withoutId(document.body)),
        id: document.uriId,
    };
}

// Nested address is the source of truth — fill or overwrite
// the request body's identity_id from the path.
function nestedTokenEntityOf(
    identityId: Id,
    document: DerivedDocument,
): IdentityTokenEntity {
    return identityTokenEntityOf({
        ...document,
        body: {
            ...withoutId(document.body),
            identity_id: identityId,
        },
    });
}

async function fetchTokenDocumentsAt(
    dbOrView: DbAdapter,
    prefix: string,
): Promise<Map<string, DerivedDocument>> {
    const messagePairs = await dbOrView.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    return deriveDocumentsAt(messagePairs, prefix);
}

// Nested docs plus leftover flat docs whose identity_id
// matches. Nested wins on the same event id.
export async function deriveIdentityTokensFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const nested = await fetchTokenDocumentsAt(
        db, tokensPrefixFor(identityId),
    );
    const flat = await fetchTokenDocumentsAt(
        db, IDENTITY_TOKENS_FLAT_PREFIX,
    );
    const byId = new Map<string, IdentityTokenEntity>();
    for (const document of flat.values()) {
        const entity = identityTokenEntityOf(document);
        if (entity.identity_id === identityId) {
            byId.set(entity.id, entity);
        }
    }
    for (const document of nested.values()) {
        const entity = nestedTokenEntityOf(
            identityId, document,
        );
        byId.set(entity.id, entity);
    }
    return [...byId.values()].sort(byIdAscending);
}

export async function deriveIdentityToken(
    db: DbAdapter,
    identityId: Id,
    tid: Id,
): Promise<IdentityTokenEntity> {
    const nested = await fetchTokenDocumentsAt(
        db, tokensPrefixFor(identityId),
    );
    const nestedDocument = nested.get(tid);
    if (nestedDocument !== undefined) {
        return nestedTokenEntityOf(identityId, nestedDocument);
    }
    const flat = await fetchTokenDocumentsAt(
        db, IDENTITY_TOKENS_FLAT_PREFIX,
    );
    const flatDocument = flat.get(tid);
    if (flatDocument !== undefined) {
        const entity = identityTokenEntityOf(flatDocument);
        if (entity.identity_id === identityId) {
            return entity;
        }
    }
    throw new EntityNotFoundError(IDENTITY_TOKENS_TABLE, tid);
}

// Internal global fold — leftover flat plus every nested
// /identities/:id/tokens/ prefix. Used by rotation/revocation
// chain lookup, never exposed as an HTTP list.
export async function deriveIdentityTokens(
    db: DbAdapter,
): Promise<IdentityTokenEntity[]> {
    const messagePairs = await db.messagePairs.getAll();
    const byId = new Map<string, IdentityTokenEntity>();
    const flat = deriveDocumentsAt(
        messagePairs, IDENTITY_TOKENS_FLAT_PREFIX,
    );
    for (const document of flat.values()) {
        byId.set(document.uriId, identityTokenEntityOf(document));
    }
    const prefixes = new Set<string>();
    for (const messagePair of messagePairs) {
        if (TOKENS_ADDRESS_PATTERN.test(messagePair.uri_collection)) {
            prefixes.add(messagePair.uri_collection);
        }
    }
    for (const prefix of prefixes) {
        const match = TOKENS_ADDRESS_PATTERN.exec(prefix)!;
        const identityId = match[1]!;
        const documents = deriveDocumentsAt(
            messagePairs, prefix,
        );
        for (const document of documents.values()) {
            byId.set(
                document.uriId,
                nestedTokenEntityOf(identityId, document),
            );
        }
    }
    return [...byId.values()].sort(byIdAscending);
}

// Every LIVE event naming `jti`, id-lex ordered — the by-jti
// fold tokenRevocationReason's SECOND read (isTokenRevoked)
// folds over, and the PRE-TX provisional leg of
// rotateRefreshJti/revokeTokenChain's own chain lookup.
// Optional identityId scopes the fold (nested prefix + leftover
// flat for that identity) so the Bearer-gate hot path does not
// full-scan. A jti that has never appeared returns [].
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
    identityId?: Id,
): Promise<IdentityTokenEntity[]> {
    const rows = identityId === undefined
        ? await deriveIdentityTokens(dbOrView)
        : await deriveIdentityTokensFor(dbOrView, identityId);
    return rows.filter((row) => row.jti === jti);
}
