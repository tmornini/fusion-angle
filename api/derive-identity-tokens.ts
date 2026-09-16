import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, IdentityTokenEntity } from './types.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The identity's tokens collection: `path =
// /identities/<id>/tokens/`, `name = <jti>` — each jti is one
// document whose history is its own issued → rotated →
// revoked (api/message-pair.ts formTokenEventMessagePair). The
// authorization_code grant's chain root is the one document
// not named by its jti: its name is the code's sha256 spend
// marker (api/authentication.ts authorizationCodeSpent). That
// root's history therefore splits — its 'issued' sits at the
// marker document while its 'rotated'/'revoked' land at the
// jti document — so once such a root rotates, this derive
// returns TWO heads carrying one jti and GET
// identities/:id/tokens/ shows one extra 'issued' row for it.
// Every fold groups by jti and resolves by `at` with the
// fail-closed rank, so the chain reads correctly regardless. A
// collection read returns heads — one row per document, its
// latest event; every event of a jti carries the same
// chain_id, so the chain fold (readTokenChainFromLedger)
// filters heads. The derived row is id-LAST
// (validateIdentityTokenEntity's order plus `id`); `id` is
// the document name. withoutId FIRST, always. Spec
// 2026-09-15 exact-read folds § 6; nothing here reads
// /identity-tokens/.

const IDENTITY_TOKENS_TABLE = 'identity_tokens';

function tokensPrefixFor(identityId: Id): string {
    return canonicalPath(
        undefined,
        '/identities/' + identityId + '/tokens/',
    );
}

export function identityTokenEntityOf(
    document: DerivedDocument,
): IdentityTokenEntity {
    return {
        ...validateIdentityTokenEntity(withoutId(document.body)),
        id: document.name,
    };
}

// The nested document is the source of truth — fill or
// overwrite the request body's identity_id from the path.
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

// One identity's collection: the head of every document
// there, id-lex.
export async function deriveIdentityTokensFor(
    db: DbAdapter,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const prefix = tokensPrefixFor(identityId);
    const documents = deriveDocumentsAt(
        await db.messagePairs.getCollectionPairs(prefix),
        prefix,
    );
    const rows: IdentityTokenEntity[] = [];
    for (const document of documents.values()) {
        rows.push(nestedTokenEntityOf(identityId, document));
    }
    return rows.sort(byIdAscending);
}

// One document: the jti's latest event.
export async function deriveIdentityToken(
    db: DbAdapter,
    identityId: Id,
    jti: Id,
): Promise<IdentityTokenEntity> {
    const prefix = tokensPrefixFor(identityId);
    const document = deriveDocumentsAt(
        await db.messagePairs.getDocumentHistory(prefix, jti),
        prefix,
    ).get(jti);
    if (document === undefined) {
        throw new EntityNotFoundError(IDENTITY_TOKENS_TABLE, jti);
    }
    return nestedTokenEntityOf(identityId, document);
}

// Every LIVE head naming `jti` in ONE identity's own
// collection — the by-jti fold tokenRevocationReason's
// SECOND read (isTokenRevoked) folds over. A jti that has
// never appeared in this identity's collection returns [].
export async function deriveIdentityTokenEventsForJti(
    dbOrView: DbAdapter,
    jti: string,
    identityId: Id,
): Promise<IdentityTokenEntity[]> {
    const rows = await deriveIdentityTokensFor(
        dbOrView, identityId,
    );
    return rows.filter((row) => row.jti === jti);
}
