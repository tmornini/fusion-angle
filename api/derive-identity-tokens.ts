import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id,
    IdentityTokenEntity,
    MessagePairEntity,
} from '../shared/types.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    headDocumentOf,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The identity's tokens collection: `path =
// /identities/<id>/tokens/`, `name = <jti>` — each jti is one
// document whose versions are its own issued → rotated →
// revoked. Its head is the token's whole state; every event
// of a jti carries the same chain_id, so the chain read
// (readTokenChainFromLedger) filters heads. The derived row
// is id-FIRST (`id`, the document name, then
// validateIdentityTokenEntity's own order). withoutId FIRST,
// always. Spec 2026-09-16 page-boot-latency § 2; nothing
// here reads /identity-tokens/.

export const IDENTITY_TOKENS_TABLE = 'identity_tokens';

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
        id: document.name,
        ...validateIdentityTokenEntity(withoutId(document.body)),
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

// A token's head: its whole state, and the pair a later
// event of it latches.
export type TokenHead = {
    readonly entity: IdentityTokenEntity,
    readonly pairId: Id,
};

function tokenHeadOf(
    identityId: Id,
    head: MessagePairEntity,
): TokenHead {
    return {
        entity: nestedTokenEntityOf(
            identityId, headDocumentOf(head),
        ),
        pairId: head.id,
    };
}

// The live head of every jti in one identity's collection.
export async function tokenHeadsFor(
    db: DbAdapter,
    identityId: Id,
): Promise<readonly TokenHead[]> {
    const heads = await db.messagePairs.getCollectionHeadPairs(
        tokensPrefixFor(identityId),
    );
    return heads.map((head) => tokenHeadOf(identityId, head));
}

// The jti's head; null when this identity never held it.
export async function tokenHeadFor(
    db: DbAdapter,
    identityId: Id,
    jti: string,
): Promise<TokenHead | null> {
    const head = await db.messagePairs.getHeadPair(
        tokensPrefixFor(identityId), jti,
    );
    return head === null ? null : tokenHeadOf(identityId, head);
}
