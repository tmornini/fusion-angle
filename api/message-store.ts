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
    get(
        collection: string,
        id: string,
    ): Promise<MessagePairEntity | undefined>;
    getMessagePairs(
        collection: string,
        id: string,
    ): Promise<readonly MessagePairEntity[]>;
    getCollection(
        collection: string,
    ): Promise<unknown[]>;
}

export function messageStore(db: DbAdapter): MessageStore {
    return {
        async get(collection, id) {
            return livePutOf(
                await messagePairsAt(db, collection, id),
            );
        },
        async getMessagePairs(collection, id) {
            return messagePairsAt(db, collection, id);
        },
        async getCollection(collection) {
            return entitiesOf(
                livePutsOf(
                    await messagePairsInCollection(
                        db, collection,
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
): MessagePairEntity | undefined {
    if (messagePairs.length === 0) return undefined;
    const rows = messagePairs.map((messagePair) => ({
        at: messagePair.response_at,
        id: messagePair.id,
        messagePair,
    }));
    return latestByKey(rows, () => 'head').get('head')
        ?.messagePair;
}

function livePutOf(
    messagePairs: readonly MessagePairEntity[],
): MessagePairEntity | undefined {
    const head = latestOf(
        messagePairs.filter(
            (messagePair) => isDocumentMethod(
                messagePair.method,
            ),
        ),
    );
    if (head?.method !== PUT_METHOD) {
        return undefined;
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

async function messagePairsInCollection(
    db: DbAdapter,
    collection: string,
): Promise<readonly MessagePairEntity[]> {
    return db.messagePairs.getCollectionPairs(collection,
    );
}

async function messagePairsAt(
    db: DbAdapter,
    collection: string,
    id: string,
): Promise<readonly MessagePairEntity[]> {
    return db.messagePairs.getDocumentHistory(collection, id);
}
