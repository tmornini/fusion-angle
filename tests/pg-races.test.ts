import {
    assert,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { connectPostgres } from
    '../api/postgres-client.ts';
import {
    PostgresBackend,
    type PostgresTx,
} from '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { TABLE_NAMES } from '../api/db.ts';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    decodeIdentifier,
    generateIdentifier,
} from '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    advisoryKey,
} from '../api/advisory-lock.ts';
import {
    ApiError,
    HTTP_GATEWAY_TIMEOUT,
    HTTP_INTERNAL_ERROR,
} from '../api/http-errors.ts';

// Live Postgres races: first-writer, If-Match, hash
// dedup, deadlock 500, timeout 504.
// Skip when POSTGRES_URL is unset so ./validate stays
// Postgres-free.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AT = '2026-01-01T00:00:00.000000Z';
const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FLOW_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/';

function schemaName(): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + '_races';
    if (!IDENT.test(name)) {
        throw new Error('invalid SCHEMA_NAME');
    }
    return name;
}

function quoteIdent(name: string): string {
    return '"' + name + '"';
}

function urlWithSearchPath(
    url: string,
    schema: string,
): string {
    const parsed = new URL(url);
    parsed.searchParams.set('search_path', schema);
    return parsed.href;
}

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: operationId ?? TEST_OPERATION_ID,
    });
}

function ideaDocument(
    title: string,
    _stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

function emptyDelta(): Record<string, unknown> {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function flowFields(name: string): Record<string, unknown> {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function uuidTextOfIdentifier(id: string): string {
    const bytes = decodeIdentifier(id);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return (
        hex.slice(0, 8) + '-'
        + hex.slice(8, 12) + '-'
        + hex.slice(12, 16) + '-'
        + hex.slice(16, 20) + '-'
        + hex.slice(20)
    );
}

function flowCreate(id: string): Record<string, unknown> {
    return {
        id,
        flow: flowFields('Race'),
        projectFlowId: generateIdentifier(),
        projectFlow: {
            project_id: 'pnXmXrxOWayANgDLdCjuBw',
            flow_id: id,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: AT,
        graphDelta: emptyDelta(),
    };
}

function flowDocument(
    name: string,
    stateEventId: string,
): Record<string, unknown> {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: { nodes: [], edges: [] },
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

async function messagePairsAt(
    db: DbAdapter,
    collection: string,
    uriId: string,
): Promise<number> {
    const rows = await db.messagePairs.getAllWhere(
        'uri_collection', collection,
    );
    return rows.filter((row) => row.uri_id === uriId)
        .length;
}

async function putHeadsAt(
    db: DbAdapter,
    collection: string,
    uriId: string,
): Promise<number> {
    const rows = await db.messagePairs.getAllWhere(
        'uri_collection', collection,
    );
    return rows.filter((row) =>
        row.uri_id === uriId && row.method === 'PUT',
    ).length;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres races skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);
    const db = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTables(TABLE_NAMES);
        await seedAdminSchema(db);
    });

    Deno.test.afterAll(async () => {
        try {
            await sql.unsafe(
                'DROP SCHEMA IF EXISTS '
                + quoteIdent(schema)
                + ' CASCADE',
            );
        } finally {
            await sql.end();
        }
    });

    Deno.test('two first-writers: one 201, not a double insert',
    async () => {
        const token = await organizationToken();
        const id = generateIdentifier();
        const holder = connectPostgres(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        const addressKey = Number(await advisoryKey(
            'fusion.address.' + FLOW_PREFIX + id,
        ));
        let raced: Promise<[Response, Response]>
            | undefined;
        try {
            await holder.begin(async (tx) => {
                await tx.query`
                    SELECT pg_advisory_xact_lock(
                        ${addressKey}
                    )
                `;
                raced = Promise.all([
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument('A', generateIdentifier()),
                        undefined,
                        generateIdentifier(),
                    )),
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument('B', generateIdentifier()),
                        undefined,
                        generateIdentifier(),
                    )),
                ]);
                await delay(300);
            });
            assert(raced !== undefined);
            const [left, right] = await raced;
            const statuses = [left.status, right.status];
            assertStrictEquals(
                statuses.filter((s) => s === 201).length,
                1,
            );
            assert(
                statuses.some((s) =>
                    s === 412 || s === 428,
                ),
            );
            assertStrictEquals(
                await putHeadsAt(db, FLOW_PREFIX, id),
                1,
            );
        } finally {
            await holder.end();
        }
    });

    Deno.test('If-Match race: one 201, one 412', async () => {
        const token = await organizationToken();
        const id = generateIdentifier();
        const created = await handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token
                , flowCreate(id),
        ));
        assertStrictEquals(created.status, 201);
        const live = await handleRequest(
            db, req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + id, token),
        );
        assertStrictEquals(live.status, 200);
        const etag = live.headers.get('ETag');
        assert(etag !== null && etag !== '');
        const heads = await db.messagePairs.getAllWhere(
            'uri_collection', FLOW_PREFIX,
        );
        const liveHead = heads
            .filter((row) => row.uri_id === id)
            .toSorted((a, b) =>
                a.response_at < b.response_at
                    ? 1
                    : a.response_at > b.response_at
                        ? -1
                        : b.id.localeCompare(a.id),
            )[0];
        assert(liveHead !== undefined);
        const holder = connectPostgres(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        let raced: Promise<[Response, Response]>
            | undefined;
        try {
            await holder.begin(async (tx) => {
                await tx.query`
                    SELECT id FROM message_pairs
                    WHERE id = ${uuidTextOfIdentifier(
                        liveHead.id,
                    )}
                    FOR UPDATE
                `;
                raced = Promise.all([
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument(
                            'Left', generateIdentifier(),
                        ),
                        { 'if-match': etag },
                        generateIdentifier(),
                    )),
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument(
                            'Right', generateIdentifier(),
                        ),
                        { 'if-match': etag },
                        generateIdentifier(),
                    )),
                ]);
                await delay(300);
            });
            assert(raced !== undefined);
            const [left, right] = await raced;
            const statuses = [left.status, right.status];
            assertStrictEquals(
                statuses.filter((s) => s === 201).length,
                1,
            );
            assertStrictEquals(
                statuses.filter((s) => s === 412).length,
                1,
            );
        } finally {
            await holder.end();
        }
    });

    Deno.test('exact-hash dedup keeps one pair', async () => {
        const token = await organizationToken();
        const body = ideaDocument(
            'Dedup', 'ev-race-dedup',
        );
        const op = generateIdentifier();
        const [left, right] = await Promise.all([
            handleRequest(db, req(
                'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + 'rZrIDSkakoKzerGHZzJnJw', token,
                body, undefined, op,
            )),
            handleRequest(db, req(
                'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + 'rZrIDSkakoKzerGHZzJnJw', token,
                body, undefined, op,
            )),
        ]);
        assertStrictEquals(left.status, 201);
        assertStrictEquals(right.status, 201);
        assertStrictEquals(
            await messagePairsAt(
                db, IDEA_PREFIX, 'rZrIDSkakoKzerGHZzJnJw',
            ),
            1,
        );
    });

    Deno.test('live deadlock maps to loud 500',
    { timeout: 8000 },
    async () => {
        const leftHeld = Promise.withResolvers<void>();
        const rightHeld = Promise.withResolvers<void>();
        const left = backend.transaction(
            ['message_pairs'],
            'readonly',
            async (tx) => {
                const pg = tx as PostgresTx;
                await pg.lock('fusion.test.deadlock.l');
                leftHeld.resolve();
                await rightHeld.promise;
                await pg.lock('fusion.test.deadlock.r');
            },
        );
        const right = backend.transaction(
            ['message_pairs'],
            'readonly',
            async (tx) => {
                const pg = tx as PostgresTx;
                await pg.lock('fusion.test.deadlock.r');
                rightHeld.resolve();
                await leftHeld.promise;
                await pg.lock('fusion.test.deadlock.l');
            },
        );
        const settled = await Promise.allSettled([
            left, right,
        ]);
        const rejected = settled.filter(
            (row) => row.status === 'rejected',
        );
        assert(rejected.length >= 1);
        const error = rejected[0]?.reason;
        assert(error instanceof ApiError);
        assertStrictEquals(error.status, HTTP_INTERNAL_ERROR);
        assertStrictEquals(error.message, 'deadlock');
    });

    Deno.test('live statement timeout maps to 504',
    async () => {
        const holder = connectPostgres(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        const tightUrl = new URL(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        tightUrl.searchParams.set(
            'statement_timeout', '500',
        );
        const tightSql = connectPostgres(tightUrl.href);
        const tight = new PostgresBackend(tightSql);
        const label = 'fusion.test.timeout';
        try {
            await holder.begin(async (tx) => {
                await tx.query`
                    SELECT pg_advisory_xact_lock(
                        ${Number(await advisoryKey(
                            label,
                        ))}
                    )
                `;
                const error = await assertRejects(
                    () => tight.transaction(
                        ['message_pairs'],
                        'readonly',
                        (txn) => (
                            txn as PostgresTx
                        ).lock(label),
                    ),
                ) as ApiError;
                assertInstanceOf(error, ApiError);
                assertStrictEquals(
                    error.status, HTTP_GATEWAY_TIMEOUT,
                );
                assertStrictEquals(
                    error.message, 'gateway timeout',
                );
            });
        } finally {
            await holder.end();
            await tightSql.end();
        }
    });
}
