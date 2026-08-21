import type { DbAdapter } from './db.ts';
import type { PairEntity } from './types.ts';
import { latestByKey } from
    '../shared/ledger-reduction.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';

// Named reads over the message plane. One document
// is getAllAtAddress (collection + uri_id). A
// collection is getAllWhere('uri_collection').
// Body containment is getAllWhereBody. No
// uri_id-only scan. Live document = latest PUT or
// DELETE at (uri_collection, uri_id) by (at, id).
// Head PUT → that pair. Head DELETE → none. POST/PATCH
// are not heads.

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

export interface MessageStore {
    get(
        collection: string,
        id: string,
    ): Promise<PairEntity | undefined>;
    getPairs(
        collection: string,
        id: string,
    ): Promise<readonly PairEntity[]>;
    getAllAt(
        collection: string,
    ): Promise<readonly PairEntity[]>;
    getAllWhereBody(
        collection: string,
        containment: Record<string, unknown>,
    ): Promise<readonly PairEntity[]>;
    getCollection(
        collection: string,
    ): Promise<unknown[]>;
    getCollectionFiltered(
        collection: string,
        filters: Readonly<Record<string, string>>,
    ): Promise<unknown[]>;
    getByVersion(
        collection: string,
        id: string,
        version: string,
    ): Promise<PairEntity | undefined>;
}

export function messageStore(db: DbAdapter): MessageStore {
    return {
        async get(collection, id) {
            return livePutOf(
                await pairsAt(db, collection, id),
            );
        },
        async getPairs(collection, id) {
            return pairsAt(db, collection, id);
        },
        async getAllAt(collection) {
            return pairsInCollection(db, collection);
        },
        async getAllWhereBody(collection, containment) {
            return (await db.pairs.getAllWhereBody(
                collection, containment,
            )).slice().sort(comparePair);
        },
        async getCollection(collection) {
            return entitiesOf(
                livePutsOf(
                    await pairsInCollection(
                        db, collection,
                    ),
                ),
            );
        },
        async getCollectionFiltered(collection, filters) {
            const rows = entitiesOf(
                livePutsOf(
                    await pairsInCollection(
                        db, collection,
                    ),
                ),
            );
            return rows.filter((row) => matchesFilters(
                row, filters,
            ));
        },
        async getByVersion(collection, id, version) {
            return latestOf(
                await db.pairs.getAllAtVersion(
                    collection, id, version,
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

function matchesFilters(
    entity: unknown,
    filters: Readonly<Record<string, string>>,
): boolean {
    if (entity === null || typeof entity !== 'object') {
        return false;
    }
    const record = entity as Record<string, unknown>;
    for (const [key, value] of Object.entries(filters)) {
        if (record[key] !== value) return false;
    }
    return true;
}

function comparePair(
    a: PairEntity, b: PairEntity,
): number {
    if (a.response_at < b.response_at) return -1;
    if (a.response_at > b.response_at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function latestOf(
    pairs: readonly PairEntity[],
): PairEntity | undefined {
    if (pairs.length === 0) return undefined;
    const rows = pairs.map((pair) => ({
        at: pair.response_at,
        id: pair.id,
        pair,
    }));
    return latestByKey(rows, () => 'head').get('head')
        ?.pair;
}

function livePutOf(
    pairs: readonly PairEntity[],
): PairEntity | undefined {
    const head = latestOf(
        pairs.filter(
            (pair) => isDocumentMethod(pair.method),
        ),
    );
    if (head?.method !== PUT_METHOD) {
        return undefined;
    }
    return head;
}

function livePutsOf(
    pairs: readonly PairEntity[],
): PairEntity[] {
    const documents = pairs.filter(
        (pair) => isDocumentMethod(pair.method),
    );
    const rows = documents.map((pair) => ({
        at: pair.response_at,
        id: pair.id,
        pair,
    }));
    const heads = latestByKey(
        rows, (row) => row.pair.uri_id,
    );
    const live: PairEntity[] = [];
    for (const row of heads.values()) {
        if (row.pair.method === PUT_METHOD) {
            live.push(row.pair);
        }
    }
    return live.sort(comparePair);
}

function entitiesOf(
    pairs: readonly PairEntity[],
): unknown[] {
    const entities: unknown[] = [];
    for (const pair of pairs) {
        const entity = jsonBodyOf(pair.response);
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

async function pairsInCollection(
    db: DbAdapter,
    collection: string,
): Promise<PairEntity[]> {
    const pairs = [
        ...await db.pairs.getAllWhere(
            'uri_collection', collection,
        ),
    ];
    return pairs.sort(comparePair);
}

async function pairsAt(
    db: DbAdapter,
    collection: string,
    id: string,
): Promise<PairEntity[]> {
    const pairs = [
        ...await db.pairs.getAllAtAddress(
            collection, id,
        ),
    ];
    return pairs.sort(comparePair);
}
