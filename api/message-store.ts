import type { DbStores } from './db.ts';
import type {
    RequestEntity,
    ResponseEntity,
} from './types.ts';
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
// Head PUT → that response. Head DELETE → none. POST/PATCH
// are not heads.

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

export interface StoredPair {
    readonly request: RequestEntity;
    readonly response: ResponseEntity;
}

export interface MessageStore {
    get(
        collection: string,
        id: string,
    ): Promise<ResponseEntity | undefined>;
    getPairs(
        collection: string,
        id: string,
    ): Promise<readonly StoredPair[]>;
    getAllAt(
        collection: string,
    ): Promise<readonly StoredPair[]>;
    getAllWhereBody(
        collection: string,
        containment: Record<string, unknown>,
    ): Promise<readonly StoredPair[]>;
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
    ): Promise<ResponseEntity | undefined>;
}

export function messageStore(db: DbStores): MessageStore {
    return {
        async get(collection, id) {
            return livePutOf(
                await pairsAt(db, collection, id),
            )?.response;
        },
        async getPairs(collection, id) {
            return pairsAt(db, collection, id);
        },
        async getAllAt(collection) {
            return pairsInCollection(db, collection);
        },
        async getAllWhereBody(collection, containment) {
            const responses =
                await db.responses.getAllWhereBody(
                    collection, containment,
                );
            const pairs: StoredPair[] = [];
            for (const response of responses) {
                const request = await db.requests
                    .getById(response.id);
                pairs.push({ request, response });
            }
            return sortByAtId(pairs);
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
            const matches = (
                await db.responses.getAllAtVersion(
                    collection, id, version,
                )
            );
            const requestById = new Map(
                (
                    await db.requests.getAllAtAddress(
                        collection, id,
                    )
                ).map((request) => [request.id, request]),
            );
            const pairs: StoredPair[] = [];
            for (const response of matches) {
                const request = requestById.get(
                    response.id,
                );
                if (request === undefined) continue;
                pairs.push({ request, response });
            }
            return latestOf(pairs)?.response;
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

function compareAtId(
    a: { at: string; id: string },
    b: { at: string; id: string },
): number {
    if (a.at < b.at) return -1;
    if (a.at > b.at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function sortByAtId(
    pairs: StoredPair[],
): StoredPair[] {
    return pairs.sort((a, b) => compareAtId(
        { at: a.response.at, id: a.response.id },
        { at: b.response.at, id: b.response.id },
    ));
}

function latestOf(
    pairs: readonly StoredPair[],
): StoredPair | undefined {
    if (pairs.length === 0) return undefined;
    const rows = pairs.map((pair) => ({
        at: pair.response.at,
        id: pair.response.id,
        pair,
    }));
    return latestByKey(rows, () => 'head').get('head')
        ?.pair;
}

function livePutOf(
    pairs: readonly StoredPair[],
): StoredPair | undefined {
    const head = latestOf(
        pairs.filter(
            (pair) => isDocumentMethod(pair.request.method),
        ),
    );
    if (head?.request.method !== PUT_METHOD) {
        return undefined;
    }
    return head;
}

function livePutsOf(
    pairs: readonly StoredPair[],
): StoredPair[] {
    const documents = pairs.filter(
        (pair) => isDocumentMethod(pair.request.method),
    );
    const rows = documents.map((pair) => ({
        at: pair.response.at,
        id: pair.response.id,
        pair,
    }));
    const heads = latestByKey(
        rows, (row) => row.pair.response.uri_id,
    );
    const live: StoredPair[] = [];
    for (const row of heads.values()) {
        if (row.pair.request.method === PUT_METHOD) {
            live.push(row.pair);
        }
    }
    return sortByAtId(live);
}

function entitiesOf(
    pairs: readonly StoredPair[],
): unknown[] {
    const entities: unknown[] = [];
    for (const pair of pairs) {
        const entity = jsonBodyOf(pair.response.message);
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
    db: DbStores,
    collection: string,
): Promise<StoredPair[]> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere(
            'uri_collection', collection,
        ),
        db.responses.getAllWhere(
            'uri_collection', collection,
        ),
    ]);
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const pairs: StoredPair[] = [];
    for (const response of responses) {
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        pairs.push({ request, response });
    }
    return sortByAtId(pairs);
}

async function pairsAt(
    db: DbStores,
    collection: string,
    id: string,
): Promise<StoredPair[]> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllAtAddress(collection, id),
        db.responses.getAllAtAddress(collection, id),
    ]);
    const requestById = new Map(
        requests.map((request) => [request.id, request]),
    );
    const pairs: StoredPair[] = [];
    for (const response of responses) {
        const request = requestById.get(response.id);
        if (request === undefined) continue;
        pairs.push({ request, response });
    }
    return sortByAtId(pairs);
}
