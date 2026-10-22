import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    connectPostgres,
    type SqlClient,
} from '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import type {
    CollectionHeadRead,
    DbAdapter,
    StorageBackend,
    Tx,
} from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { MEMBERSHIPS_PATH } from '../api/memberships.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import {
    apiRequest,
} from './http-fixtures.ts';
import {
    decodeIdentifier,
    generateIdentifier,
} from '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import {
    advisoryKey,
    POOL_MAX,
} from '../api/advisory-lock.ts';

// Live Postgres races: first-writer, If-Match, a second
// genesis, and a seat removal under a flow PUT. Skip when
// POSTGRES_URL is unset so ./validate stays Postgres-free.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const AT = '2026-01-01T00:00:00.000000Z';
const REMOVED_AT = '2026-01-01T00:00:01.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FLOW_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/';
const MEMBERSHIPS_ROUTE =
    '/organizations/' + ORGANIZATION + '/memberships/';
const INVITATIONS_PREFIX =
    '/organizations/' + ORGANIZATION + '/invitations/';
// The paused flow's own client announces itself, so the
// probe below can tell a waiter the flow blocks from any
// other lock wait in this database.
const PAUSED_FLOW = 'fusion-angle-paused-flow';
// A cap only a hang reaches: each probe is one round trip
// and the code decides the outcome, so the bound is a count
// of probes, never a timer.
const PROBE_LIMIT = 10_000;

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
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

function ideaDocument(title: string): Record<string, unknown> {
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
    return flowDocumentOf(
        name, stateEventId, { nodes: [], edges: [] },
    );
}

function flowDocumentOf(
    name: string,
    stateEventId: string,
    graph: { nodes: unknown[]; edges: unknown[] },
): Record<string, unknown> {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph,
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

function graphNode(
    agentIds: readonly string[],
): Record<string, unknown> {
    return {
        id: generateIdentifier(),
        name: 'Step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        agentIds,
        attributes: [],
        taskInstructions: '',
    };
}

function agentFields(name: string): Record<string, unknown> {
    return {
        name,
        description: 'A standing agent',
        skill_focus: 'drafting',
        model: firstProviderModel().id,
    };
}

// A backend over `inner` whose transactions pause once: the
// first head batch that reads `organization`'s memberships
// answers, then its transaction waits, still open and still
// holding its connection, until `release`. The statement
// runs on the inner handle, the one the backend knows its
// client by.
function pausedAfterRosterRead(
    inner: StorageBackend,
    organization: string,
): {
    readonly backend: StorageBackend;
    readonly readDone: Promise<void>;
    readonly release: () => void;
} {
    let readDone!: () => void;
    const read = new Promise<void>((resolve) => {
        readDone = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    let armed = true;
    const inners = new WeakMap<Tx, Tx>();
    const rosterRead = (
        reads: readonly CollectionHeadRead[],
    ): boolean => reads.some((read) =>
        'contains' in read
        && read.path === MEMBERSHIPS_PATH
        && read.contains['organization_id'] === organization,
    );
    const paused = (tx: Tx): Tx => {
        const view: Tx = {
            ...tx,
            getCollectionHeadPairsBatch: async <
                T extends { id: string },
            >(
                reads: readonly CollectionHeadRead[],
            ): Promise<T[][]> => {
                const answers = await tx
                    .getCollectionHeadPairsBatch<T>(reads);
                if (armed && rosterRead(reads)) {
                    armed = false;
                    readDone();
                    await released;
                }
                return answers;
            },
        };
        inners.set(view, tx);
        return view;
    };
    const innerOf = (tx: Tx): Tx => {
        const found = inners.get(tx);
        if (found === undefined) {
            throw new Error(
                'a statement on a handle this backend'
                + ' did not open',
            );
        }
        return found;
    };
    const backend: StorageBackend = {
        read: (fn) => inner.read(fn),
        transaction: (mode, fn) => inner.transaction(
            mode, (tx) => fn(paused(tx)),
        ),
        seedTransaction: (fn) => inner.seedTransaction(fn),
        ensureTable: () => inner.ensureTable(),
        executeLedger: (attempt, rows, now, tx) =>
            inner.executeLedger(
                attempt, rows, now,
                tx === undefined ? undefined : innerOf(tx),
            ),
        hasSchema: () => inner.hasSchema(),
        postSchemaCreation: () => inner.postSchemaCreation(),
        deleteSchema: () => inner.deleteSchema(),
    };
    return { backend, readDone: read, release };
}

// Whether a backend in this database waits on a lock the
// paused flow's backend holds. pg_stat_activity decides,
// never elapsed time.
async function waitsOnPausedFlow(
    probe: SqlClient,
): Promise<boolean> {
    const [row] = await probe.query<{ waiting: number }>`
        SELECT count(*)::int AS waiting
        FROM pg_stat_activity AS waiter
        WHERE waiter.datname = current_database()
          AND waiter.wait_event_type = 'Lock'
          AND EXISTS (
              SELECT 1 FROM pg_stat_activity AS holder
              WHERE holder.pid = ANY (
                  pg_blocking_pids(waiter.pid)
              )
                AND holder.application_name = ${PAUSED_FLOW}
          )
    `;
    if (row === undefined) {
        throw new Error('pg_stat_activity answered no row');
    }
    return row.waiting > 0;
}

async function messagePairsAt(
    db: DbAdapter,
    collection: string,
    name: string,
): Promise<number> {
    const rows = await db.messagePairs.getCollectionPairs(collection,
    );
    return rows.filter((row) => row.name === name)
        .length;
}

async function putHeadsAt(
    db: DbAdapter,
    collection: string,
    name: string,
): Promise<number> {
    const rows = await db.messagePairs.getCollectionPairs(collection,
    );
    return rows.filter((row) =>
        row.name === name && row.method === 'PUT',
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
        await backend.ensureTable();
        await seedAdminSchema(db);
        // Open the pool to its full width here: a
        // pooled connection starts a max_lifetime
        // timer when its socket connects, and the ops
        // sanitizer blames whichever test first widens
        // the pool. Every timer must predate test one.
        await Promise.all(Array.from(
            { length: POOL_MAX },
            () => sql.query`SELECT 1`,
        ));
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
        const documentLockKey = Number(await advisoryKey(
            'fusion.document.' + FLOW_PREFIX + id,
        ));
        let raced: Promise<[Response, Response]>
            | undefined;
        try {
            await holder.begin(async (tx) => {
                await tx.query`
                    SELECT pg_advisory_xact_lock(
                        ${documentLockKey}
                    )
                `;
                raced = Promise.all([
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument('A', generateIdentifier()),
                        { 'if-none-match': '*' },
                        generateIdentifier(),
                    )),
                    handleRequest(db, req(
                        'PUT',
                        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                            + '' + id, token,
                        flowDocument('B', generateIdentifier()),
                        { 'if-none-match': '*' },
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
            assertStrictEquals(
                await putHeadsAt(db, FLOW_PREFIX, id),
                1,
            );
        } finally {
            await holder.end();
        }
    });

    Deno.test('If-Match race: one 200, one 412', async () => {
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
        const heads = await db.messagePairs.getCollectionPairs(FLOW_PREFIX,
        );
        const liveHead = heads
            .filter((row) => row.name === id)
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
                    SELECT id FROM fa_message_pairs
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
                statuses.filter((s) => s === 200).length,
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

    Deno.test('a racing blind PUT matches the first and keeps one pair',
    async () => {
        const token = await organizationToken();
        const body = ideaDocument('Dedup');
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
        const statuses = [left.status, right.status];
        assertStrictEquals(
            statuses.filter((s) => s === 201).length,
            1,
        );
        assertStrictEquals(
            statuses.filter((s) => s === 200).length,
            1,
        );
        assertStrictEquals(
            await messagePairsAt(
                db, IDEA_PREFIX, 'rZrIDSkakoKzerGHZzJnJw',
            ),
            1,
        );
    });

    // The flow PUT pauses right after its roster read, on a
    // client of its own; the seat removal then runs on the
    // shared pool. The pause ends when the removal settles or
    // waits on the paused flow, whichever the code decides.
    // Either history is serializable: the law refused the
    // flow, or the flow's head precedes the removal's.
    Deno.test('a seat removal under a paused flow PUT lands'
    + ' after it or refuses it', async () => {
        const token = await organizationToken();
        const agentId = generateIdentifier();
        const created = await handleRequest(db, req(
            'POST', MEMBERSHIPS_ROUTE, token,
            {
                id: agentId,
                kind: 'ai',
                membership: { type: 'member', at: AT },
                ai: agentFields('Raced agent'),
            },
        ));
        assertStrictEquals(created.status, 201);
        const etag = created.headers.get('ETag');
        assert(etag !== null);
        const membership = membershipNameOf(
            ORGANIZATION, agentId,
        );
        const flowUrl = new URL(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        flowUrl.searchParams.set('application_name', PAUSED_FLOW);
        const flowSql = connectPostgres(flowUrl.href);
        const probe = connectPostgres(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        const seam = pausedAfterRosterRead(
            new PostgresBackend(flowSql), ORGANIZATION,
        );
        const paused = new BackedDbAdapter(
            seam.backend,
            async () => {},
            async () => {},
            () => {},
        );
        const flowId = generateIdentifier();
        try {
            const flow = handleRequest(paused, req(
                'PUT', FLOW_PREFIX + flowId, token,
                flowDocumentOf(
                    'Raced agent',
                    generateIdentifier(),
                    { nodes: [graphNode([agentId])], edges: [] },
                ),
                { 'if-none-match': '*' },
                generateIdentifier(),
            ));
            const early = await Promise.race([
                seam.readDone.then(() => undefined),
                flow,
            ]);
            if (early !== undefined) {
                throw new Error(
                    'flow PUT answered ' + early.status
                    + ' before its roster read',
                );
            }
            const removal = handleRequest(db, req(
                'PUT', INVITATIONS_PREFIX + membership, token,
                { state: 'removed', at: REMOVED_AT },
                { 'if-match': etag },
                generateIdentifier(),
            ));
            let settled = false;
            removal.then(
                () => {
                    settled = true;
                },
                () => {
                    settled = true;
                },
            );
            let blocked = false;
            let probes = 0;
            while (!settled && !blocked) {
                if (probes === PROBE_LIMIT) {
                    throw new Error(
                        'the removal neither settled nor waited'
                        + ' on the paused flow within '
                        + String(PROBE_LIMIT) + ' probes',
                    );
                }
                probes += 1;
                blocked = await waitsOnPausedFlow(probe);
            }
            const settledDuringPause = settled;
            seam.release();
            const [flowResponse, removalResponse] =
                await Promise.all([flow, removal]);
            assertStrictEquals(removalResponse.status, 200);
            const removalHead = await db.messagePairs
                .getHeadPair(MEMBERSHIPS_PATH, membership);
            assert(removalHead !== null);
            const flowHead = await db.messagePairs
                .getHeadPair(FLOW_PREFIX, flowId);
            if (flowResponse.status === 400) {
                assertEquals(await flowResponse.json(), {
                    error: 'agentIds must name a live AI agent',
                });
                assertStrictEquals(flowHead, null);
                return;
            }
            assertStrictEquals(flowResponse.status, 201);
            assert(flowHead !== null);
            assert(
                flowHead.response_at < removalHead.response_at,
                'flow PUT landed at ' + flowHead.response_at
                    + ', after the seat removal at '
                    + removalHead.response_at
                    + ': the law judged a roster the removal'
                    + ' had already left (the removal settled'
                    + ' during the pause: '
                    + String(settledDuringPause)
                    + '; it waited on the paused flow: '
                    + String(blocked) + ')',
            );
        } finally {
            seam.release();
            await flowSql.end();
            await probe.end();
        }
    });
}
