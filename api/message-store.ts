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

// Named reads over the message plane. Dual-ZIP memory/IDB
// path: index `uri_collection`, then filter in JS. No
// uri_id-only scan. Live document = latest PUT or DELETE
// at (uri_collection, uri_id) by (at, id). Head PUT →
// that response. Head DELETE → none. POST/PATCH are not
// heads.

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
            const pairs = await pairsInCollection(
                db, collection,
            );
            return pairs.filter((pair) => containsFact(
                jsonBodyOf(pair.response.message),
                containment,
            ));
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
                await pairsAt(db, collection, id)
            ).filter(
                (pair) => pair.response.version === version,
            );
            return latestOf(matches)?.response;
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

function containsFact(
    body: unknown,
    containment: Record<string, unknown>,
): boolean {
    if (body === null || typeof body !== 'object') {
        return false;
    }
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(containment)) {
        if (
            JSON.stringify(record[key])
            !== JSON.stringify(value)
        ) {
            return false;
        }
    }
    return true;
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
    const pairs = await pairsInCollection(db, collection);
    return pairs.filter(
        (pair) => pair.response.uri_id === id,
    );
}
