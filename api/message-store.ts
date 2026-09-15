import type { DbAdapter } from './db.ts';
import type { MessagePairEntity } from './types.ts';
import { latestByKey } from
    '../shared/ledger-reduction.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';

// Named reads over the message plane. One document
// is getDocumentHistory (path + name). A
// collection is getCollectionPairs.
// Body containment is getAllWhereBody. No
// name-only scan. The seam orders by
// (response_at, id); the store never re-sorts rows.
// Live document = latest PUT or DELETE at
// (path, name) by (at, id). Head PUT →
// that pair. Head DELETE → none. POST/PATCH are
// not heads.

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

export interface MessageStore {
    getDocumentHead(
        path: string,
        name: string,
    ): Promise<MessagePairEntity | null>;
    getDocumentHistory(
        path: string,
        name: string,
    ): Promise<readonly MessagePairEntity[]>;
    getCollection(path: string): Promise<unknown[]>;
}

export function messageStore(db: DbAdapter): MessageStore {
    return {
        async getDocumentHead(path, name) {
            return livePutOf(
                await db.messagePairs.getDocumentHistory(
                    path, name,
                ),
            );
        },
        async getDocumentHistory(path, name) {
            return db.messagePairs.getDocumentHistory(
                path, name,
            );
        },
        async getCollection(path) {
            return entitiesOf(
                livePutsOf(
                    await db.messagePairs.getCollectionPairs(
                        path,
                    ),
                ),
            );
        },
    };
}

function isDocumentMethod(method: string): boolean {
    return method === PUT_METHOD
        || method === DELETE_METHOD;
}

function jsonBodyOf(message: string): unknown | undefined {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    if (!body.exists()) return undefined;
    return JSON.parse(body.toText());
}

function compareMessagePair(
    a: MessagePairEntity, b: MessagePairEntity,
): number {
    if (a.response_at < b.response_at) return -1;
    if (a.response_at > b.response_at) return 1;
    return compareIdentifiers(a.id, b.id);
}

function latestOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity | null {
    if (messagePairs.length === 0) return null;
    const rows = messagePairs.map((messagePair) => ({
        at: messagePair.response_at,
        id: messagePair.id,
        messagePair,
    }));
    return latestByKey(rows, () => 'head').get('head')
        ?.messagePair ?? null;
}

function livePutOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity | null {
    const head = latestOf(
        messagePairs.filter(
            (messagePair) => isDocumentMethod(
                messagePair.method,
            ),
        ),
    );
    if (head === null || head.method !== PUT_METHOD) {
        return null;
    }
    return head;
}

function livePutsOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity[] {
    const documents = messagePairs.filter(
        (messagePair) => isDocumentMethod(
            messagePair.method,
        ),
    );
    const rows = documents.map((messagePair) => ({
        at: messagePair.response_at,
        id: messagePair.id,
        messagePair,
    }));
    const heads = latestByKey(
        rows, (row) => row.messagePair.name,
    );
    const live: MessagePairEntity[] = [];
    for (const row of heads.values()) {
        if (row.messagePair.method === PUT_METHOD) {
            live.push(row.messagePair);
        }
    }
    // Heads sorted by the HEAD pair's (response_at, id).
    // The seam's row order would yield each document's
    // FIRST pair — a different order once documents
    // interleave updates.
    return live.sort(compareMessagePair);
}

function entitiesOf(
    messagePairs: readonly MessagePairEntity[],
): unknown[] {
    const entities: unknown[] = [];
    for (const messagePair of messagePairs) {
        const entity = jsonBodyOf(messagePair.response);
        if (entity !== undefined) entities.push(entity);
    }
    return entities;
}

// Document id on a getCollection row. Stored PUT success
// bodies carry `id`; absence is a wiring bug.
export function liveHeadId(entity: unknown): string {
    if (
        entity === null
        || typeof entity !== 'object'
        || !('id' in entity)
        || typeof entity.id !== 'string'
        || entity.id === ''
    ) {
        throw new Error('live head has no id');
    }
    return entity.id;
}
