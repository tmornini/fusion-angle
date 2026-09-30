import type { DbAdapter } from './db.ts';
import type { MessagePairEntity } from '../shared/types.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';

// Three reads over the ledger, each one seam read. The seam
// serves both heads in SQL (getHeadPair,
// getCollectionHeadPairs); this layer parses bodies and
// decides that a DELETE head is no document.

const PUT_METHOD = 'PUT';

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
            const head = await db.messagePairs.getHeadPair(
                path, name,
            );
            return head !== null && head.method === PUT_METHOD
                ? head
                : null;
        },
        async getDocumentHistory(path, name) {
            return db.messagePairs.getDocumentHistory(
                path, name,
            );
        },
        async getCollection(path) {
            return entitiesOf(
                await db.messagePairs.getCollectionHeadPairs(
                    path,
                ),
            );
        },
    };
}

function jsonBodyOf(message: string): unknown | undefined {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    if (!body.exists()) return undefined;
    return JSON.parse(body.toText());
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
