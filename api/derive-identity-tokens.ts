import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, IdentityTokenEntity } from './types.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
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
// row-write appends its own event pair at 'identity-tokens/
// <rowId>' (api/message-pair.ts's formTokenEventPair — the SAME
// address/method/response shape a real PUT identity-tokens/:id
// would store) — issued roots (grant, client-credentials, token-
// exchange, the org-exchange hop), rotations, and revocations ALL
// form one, so this derivation now sees every LIVE row the row
// plane does. Before Task 5 a pair-less writer would have left
// this derivation blind to rows the Tokens page still showed —
// exactly the hazard api/routes.ts's own NOT-FLIPPED comment named
// before this task retired it.
//
// THE KEY-ORDER SUBTLETY (Step 0, this task's brief): the STORED
// ROW is id-LAST — HistoryEntityStore#put's own `{
// ...this.#validate(body), id }` spread — jti, identity_id,
// action, chain_id, at, id, in validateIdentityTokenEntity's own
// return-literal order. The derive-organizations.ts precedent
// (organizationEntityOf) applies verbatim: identityTokenEntityOf
// re-runs the pair's own REQUEST body (document.body —
// deriveDocumentsAt reads db.requests, never db.responses, for
// the document itself) through validateIdentityTokenEntity and
// appends `id` LAST — NOT the id-FIRST spread api/routes.ts's
// WRITE_RESPONSE_SPECS['identity-tokens/:id'].successBody forms.
// That id-first shape answers a different question (what the
// ledger's own STORED RESPONSE message records), never what a
// live GET returns — api/message-pair.ts's formTokenEventPair
// carries the SAME split: its request body is the bare event
// (Omit<IdentityTokenEntity, 'id'>), its stored response body is
// `{id, ...validateIdentityTokenEntity(body)}`. withoutId FIRST,
// always (the organizationEntityOf / deriveMembershipsForIdentity
// precedent): a synthesized event pair's request body never
// carries a stray id, but a below-facade PUT could, and stripping
// unconditionally costs nothing. tests/drift-identity-tokens.
// test.ts pins both the positive (id-last) shape and the NEGATIVE
// counter-example (an id-first spread is NOT byte-identical).
//
// EVENT-APPEND, not document-class (api/routes.ts's own route
// comment): every row id is a fresh generateCryptoSafeBase62()
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
// header draws this line for its own siblings) — two independent
// getAllWhere reads, outside any transaction, is the cheaper shape
// every OTHER derive-identity-spine.ts facet but pii already uses.
//
// Reads db.requests/db.responses (+ pickString/validate-
// IdentityTokenEntity over their decoded bodies) ONLY — never
// db.identityTokens, the row-plane table this task's GET flip
// retired as a production READ; Phase 13 Task 9 retires the
// row-plane WRITE too (the PUT route goes pair-only), so the
// table itself carries no production traffic on either side from
// here on.

const IDENTITY_TOKENS_TABLE = 'identity_tokens';

const IDENTITY_TOKENS_PREFIX =
    canonicalUriPrefix(undefined, '/identity-tokens/');

function identityTokenEntityOf(
    document: DerivedDocument,
): IdentityTokenEntity {
    return {
        ...validateIdentityTokenEntity(withoutId(document.body)),
        id: document.uriId,
    };
}

async function fetchIdentityTokenDocuments(
    dbOrView: DbAdapter,
): Promise<Map<string, DerivedDocument>> {
    const [requests, responses] = await Promise.all([
        dbOrView.requests.getAllWhere(
            'uri_prefix', IDENTITY_TOKENS_PREFIX,
        ),
        dbOrView.responses.getAllWhere(
            'uri_prefix', IDENTITY_TOKENS_PREFIX,
        ),
    ]);
    return deriveDocumentsAt(
        requests, responses, IDENTITY_TOKENS_PREFIX,
    );
}

// Every LIVE identity-token event row, id-lex ordered
// (byIdAscending, the IndexedDB reference) — GET /identity-tokens'
// own read source from this task on.
export async function deriveIdentityTokens(
    db: DbAdapter,
): Promise<IdentityTokenEntity[]> {
    const documents = await fetchIdentityTokenDocuments(db);
    const rows: IdentityTokenEntity[] = [];
    for (const document of documents.values()) {
        rows.push(identityTokenEntityOf(document));
    }
    return rows.sort(byIdAscending);
}

// The single-row read; throws EntityNotFoundError(
// 'identity_tokens', id) on absence — mirroring
// db.identityTokens.getById's own EntityNotFoundError(this same
// table, id). GET /identity-tokens/:id's own read source from
// this task on.
export async function deriveIdentityToken(
    db: DbAdapter,
    id: Id,
): Promise<IdentityTokenEntity> {
    const documents = await fetchIdentityTokenDocuments(db);
    const document = documents.get(id);
    if (document === undefined) {
        throw new EntityNotFoundError(IDENTITY_TOKENS_TABLE, id);
    }
    return identityTokenEntityOf(document);
}

// Every LIVE event naming `jti`, id-lex ordered — the by-jti fold
// tokenRevocationReason's SECOND read (isTokenRevoked) folds over,
// and the PRE-TX provisional leg of rotateRefreshJti/
// revokeTokenChain's own chain lookup (api/authentication.ts).
// A jti that has never appeared returns an empty array, never a
// throw — isTokenRevoked/chainIdForJti/identityForJti (api/
// identity-tokens.ts) all treat an empty set as "unknown", the
// SAME contract the row-plane getAllWhere('jti', jti) miss always
// carried.
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
): Promise<IdentityTokenEntity[]> {
    const documents = await fetchIdentityTokenDocuments(dbOrView);
    const rows: IdentityTokenEntity[] = [];
    for (const document of documents.values()) {
        const entity = identityTokenEntityOf(document);
        if (entity.jti === jti) {
            rows.push(entity);
        }
    }
    return rows.sort(byIdAscending);
}
