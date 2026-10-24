import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    connectPostgres,
    type SqlClient,
    type UnsafeOptions,
} from '../api/postgres-client.ts';
import {
    ORGANIZATION_ROW_FOR_UPDATE_SQL,
    PostgresBackend,
} from '../api/backend-postgres.ts';
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
import {
    quoteIdent,
    schemaName,
    urlWithSearchPath,
} from './pg-schema.ts';

// Live Postgres races: first-writer, If-Match, a second
// genesis, a seat removal under a flow PUT, a flow PUT
// under a seat removal, a program member created under a
// flow write, and two flow writes that do not wait on each
// other. Skip when POSTGRES_URL is unset so
// ./validate stays Postgres-free.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const AT = '2026-01-01T00:00:00.000000Z';
const REMOVED_AT = '2026-01-01T00:00:01.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FLOW_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/';
const AI_AGENTS_PREFIX =
    '/organizations/' + ORGANIZATION + '/ai-agents/';
const SERVICES_PREFIX =
    '/organizations/' + ORGANIZATION + '/services/';
const MEMBERSHIPS_ROUTE =
    '/organizations/' + ORGANIZATION + '/memberships/';
const INVITATIONS_PREFIX =
    '/organizations/' + ORGANIZATION + '/invitations/';
// The paused flow's own client announces itself, so the
// probe below can tell a waiter the flow blocks from any
// other lock wait in this database.
const PAUSED_FLOW = 'fusion-angle-paused-flow';
// Likewise the paused seat removal's.
const PAUSED_ROSTER = 'fusion-angle-paused-roster';
// A cap only a hang reaches: each probe is one round trip
// and the code decides the outcome, so the bound is a count
// of probes, never a timer.
const PROBE_LIMIT = 10_000;

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

// A create whose one node seats `memberId`: the graph the
// law judges is reduced from the delta.
function flowCreateSeating(
    id: string,
    memberId: string,
): Record<string, unknown> {
    const nodeId = generateIdentifier();
    return {
        ...flowCreate(id),
        graphDelta: {
            ...emptyDelta(),
            nodes: [{
                id: nodeId,
                flow_id: id,
                name: 'Step',
                position_x: 0,
                position_y: 0,
                is_create: true,
                is_archive: false,
                task_instructions: '',
                at: AT,
            }],
            memberEvents: [{
                id: generateIdentifier(),
                flow_node_id: nodeId,
                member_id: memberId,
                action: 'added',
                at: AT,
            }],
        },
    };
}

function graphNode(
    memberIds: readonly string[],
    agentIds: readonly string[],
): Record<string, unknown> {
    return {
        id: generateIdentifier(),
        name: 'Step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds,
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

function aiMember(
    id: string,
    name: string,
): Record<string, unknown> {
    return {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields(name),
    };
}

function serviceMember(id: string): Record<string, unknown> {
    return {
        id,
        kind: 'service',
        membership: { type: 'member', at: AT },
        service: {
            name: 'Raced service',
            description: 'A standing service',
        },
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

// A client over `inner` that pauses once: after the query
// whose text is the product's FOR UPDATE on an organization
// row answers, its caller waits — its transaction, if any,
// still open — until `release`. A transaction hands out the
// same pausing face, so a take inside BEGIN pauses inside it.
function pausedAfterTake(inner: SqlClient): {
    readonly client: SqlClient;
    readonly takeDone: Promise<void>;
    readonly release: () => void;
} {
    let takeDone!: () => void;
    const taken = new Promise<void>((resolve) => {
        takeDone = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
        release = resolve;
    });
    let armed = true;
    const pausing = (client: SqlClient): SqlClient => ({
        query: <T>(
            strings: TemplateStringsArray,
            ...values: readonly unknown[]
        ): Promise<T[]> => client.query<T>(strings, ...values),
        begin: <T>(
            fn: (sql: SqlClient) => Promise<T>,
            options?: string,
        ): Promise<T> => client.begin(
            (sql) => fn(pausing(sql)), options,
        ),
        unsafe: async <T>(
            text: string,
            parameters?: readonly unknown[],
            options?: UnsafeOptions,
        ): Promise<T[]> => {
            const rows = await client.unsafe<T>(
                text, parameters, options,
            );
            if (armed && text === ORGANIZATION_ROW_FOR_UPDATE_SQL) {
                armed = false;
                takeDone();
                await released;
            }
            return rows;
        },
        end: () => client.end(),
    });
    return { client: pausing(inner), takeDone: taken, release };
}

// The application names of the backends in this database
// waiting on a lock a backend named `holder` holds.
// pg_stat_activity decides, never elapsed time.
async function lockWaitersBlockedBy(
    probe: SqlClient,
    holder: string,
): Promise<string[]> {
    const rows = await probe.query<{ application_name: string }>`
        SELECT waiter.application_name
        FROM pg_stat_activity AS waiter
        WHERE waiter.datname = current_database()
          AND waiter.wait_event_type = 'Lock'
          AND EXISTS (
              SELECT 1 FROM pg_stat_activity AS holding
              WHERE holding.pid = ANY (
                  pg_blocking_pids(waiter.pid)
              )
                AND holding.application_name = ${holder}
          )
    `;
    return rows.map((row) => row.application_name);
}

// The two answers of a roster write raced under a flow
// write paused after its roster read, and what ended the
// pause: the roster write settled, or it waited on the
// paused flow.
interface RacedUnderPausedFlow {
    readonly flowResponse: Response;
    readonly rosterResponse: Response;
    readonly settledDuringPause: boolean;
    readonly blocked: boolean;
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
    const schema = schemaName('_races');
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

    // A client of this schema whose backends carry
    // `application`, for the probe to name.
    const clientNamed = (application: string): SqlClient => {
        const url = new URL(urlWithSearchPath(POSTGRES_URL, schema));
        url.searchParams.set('application_name', application);
        return connectPostgres(url.href);
    };

    // `flow` runs on a client of its own, paused right after
    // its roster read; `roster` then runs on the shared pool.
    // The pause ends when the roster write settles or waits
    // on the paused flow, whichever the code decides; then
    // both answer.
    const racedUnderPausedFlow = async (
        flow: (paused: DbAdapter) => Promise<Response>,
        roster: () => Promise<Response>,
    ): Promise<RacedUnderPausedFlow> => {
        const flowSql = clientNamed(PAUSED_FLOW);
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
        try {
            const flowAnswer = flow(paused);
            const early = await Promise.race([
                seam.readDone.then(() => undefined),
                flowAnswer,
            ]);
            if (early !== undefined) {
                throw new Error(
                    'the flow write answered ' + early.status
                    + ' before its roster read',
                );
            }
            const rosterAnswer = roster();
            let settled = false;
            rosterAnswer.then(
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
                        'the roster write neither settled nor'
                        + ' waited on the paused flow within '
                        + String(PROBE_LIMIT) + ' probes',
                    );
                }
                probes += 1;
                blocked = (
                    await lockWaitersBlockedBy(probe, PAUSED_FLOW)
                ).length > 0;
            }
            const settledDuringPause = settled;
            seam.release();
            const [flowResponse, rosterResponse] =
                await Promise.all([flowAnswer, rosterAnswer]);
            return {
                flowResponse,
                rosterResponse,
                settledDuringPause,
                blocked,
            };
        } finally {
            seam.release();
            await flowSql.end();
            await probe.end();
        }
    };

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

    // Either history is serializable: the law refused the
    // flow, or the flow's head precedes the removal's.
    Deno.test('a seat removal under a paused flow PUT lands'
    + ' after it or refuses it', async () => {
        const token = await organizationToken();
        const agentId = generateIdentifier();
        const created = await handleRequest(db, req(
            'POST', MEMBERSHIPS_ROUTE, token,
            aiMember(agentId, 'Raced agent'),
        ));
        assertStrictEquals(created.status, 201);
        const etag = created.headers.get('ETag');
        assert(etag !== null);
        const membership = membershipNameOf(
            ORGANIZATION, agentId,
        );
        const flowId = generateIdentifier();
        const raced = await racedUnderPausedFlow(
            (paused) => handleRequest(paused, req(
                'PUT', FLOW_PREFIX + flowId, token,
                flowDocumentOf(
                    'Raced agent',
                    generateIdentifier(),
                    {
                        nodes: [graphNode([], [agentId])],
                        edges: [],
                    },
                ),
                { 'if-none-match': '*' },
                generateIdentifier(),
            )),
            () => handleRequest(db, req(
                'PUT', INVITATIONS_PREFIX + membership, token,
                { state: 'removed', at: REMOVED_AT },
                { 'if-match': etag },
                generateIdentifier(),
            )),
        );
        assertStrictEquals(raced.rosterResponse.status, 200);
        const removalHead = await db.messagePairs
            .getHeadPair(MEMBERSHIPS_PATH, membership);
        assert(removalHead !== null);
        const flowHead = await db.messagePairs
            .getHeadPair(FLOW_PREFIX, flowId);
        if (raced.flowResponse.status === 400) {
            assertEquals(await raced.flowResponse.json(), {
                error: 'agentIds must name a live AI agent',
            });
            assertStrictEquals(flowHead, null);
            return;
        }
        assertStrictEquals(raced.flowResponse.status, 201);
        assert(flowHead !== null);
        assert(
            flowHead.response_at < removalHead.response_at,
            'flow PUT landed at ' + flowHead.response_at
                + ', after the seat removal at '
                + removalHead.response_at
                + ': the law judged a roster the removal'
                + ' had already left (the removal settled'
                + ' during the pause: '
                + String(raced.settledDuringPause)
                + '; it waited on the paused flow: '
                + String(raced.blocked) + ')',
        );
    });

    // The seat removal pauses right after taking its
    // organization row, on a client of its own; the flow PUT
    // then starts on another. The pause ends when the flow
    // waits on the removal or reads its roster, whichever
    // the code decides. A take whose statement runs outside
    // the take's transaction holds nothing, and the flow
    // reads a roster the removal is about to leave.
    Deno.test('a flow PUT under a paused seat removal is'
    + ' refused or precedes it', async () => {
        const token = await organizationToken();
        const agentId = generateIdentifier();
        const created = await handleRequest(db, req(
            'POST', MEMBERSHIPS_ROUTE, token,
            aiMember(agentId, 'Taken agent'),
        ));
        assertStrictEquals(created.status, 201);
        const etag = created.headers.get('ETag');
        assert(etag !== null);
        const membership = membershipNameOf(
            ORGANIZATION, agentId,
        );
        const rosterSql = clientNamed(PAUSED_ROSTER);
        const rosterSeam = pausedAfterTake(rosterSql);
        const rosterDb = new BackedDbAdapter(
            new PostgresBackend(rosterSeam.client),
            async () => {},
            async () => {},
            () => {},
        );
        const flowSql = clientNamed(PAUSED_FLOW);
        const flowSeam = pausedAfterRosterRead(
            new PostgresBackend(flowSql), ORGANIZATION,
        );
        const flowDb = new BackedDbAdapter(
            flowSeam.backend,
            async () => {},
            async () => {},
            () => {},
        );
        const probe = connectPostgres(
            urlWithSearchPath(POSTGRES_URL, schema),
        );
        const flowId = generateIdentifier();
        try {
            const removal = handleRequest(rosterDb, req(
                'PUT', INVITATIONS_PREFIX + membership, token,
                { state: 'removed', at: REMOVED_AT },
                { 'if-match': etag },
                generateIdentifier(),
            ));
            const earlyRemoval = await Promise.race([
                rosterSeam.takeDone.then(() => undefined),
                removal,
            ]);
            if (earlyRemoval !== undefined) {
                throw new Error(
                    'seat removal answered ' + earlyRemoval.status
                    + ' before taking its organization',
                );
            }
            const flow = handleRequest(flowDb, req(
                'PUT', FLOW_PREFIX + flowId, token,
                flowDocumentOf(
                    'Taken agent',
                    generateIdentifier(),
                    {
                        nodes: [graphNode([], [agentId])],
                        edges: [],
                    },
                ),
                { 'if-none-match': '*' },
                generateIdentifier(),
            ));
            let read = false;
            flowSeam.readDone.then(() => {
                read = true;
            });
            let answered = false;
            flow.then(
                () => {
                    answered = true;
                },
                () => {
                    answered = true;
                },
            );
            let blocked = false;
            let probes = 0;
            while (!read && !answered && !blocked) {
                if (probes === PROBE_LIMIT) {
                    throw new Error(
                        'the flow neither read its roster nor'
                        + ' waited on the paused removal within '
                        + String(PROBE_LIMIT) + ' probes',
                    );
                }
                probes += 1;
                blocked = (
                    await lockWaitersBlockedBy(probe, PAUSED_ROSTER)
                ).includes(PAUSED_FLOW);
            }
            if (answered) {
                throw new Error(
                    'flow PUT answered ' + (await flow).status
                    + ' before its roster read',
                );
            }
            const readDuringTake = read;
            rosterSeam.release();
            const removalResponse = await removal;
            assertStrictEquals(removalResponse.status, 200);
            await Promise.race([flowSeam.readDone, flow]);
            flowSeam.release();
            const flowResponse = await flow;
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
                    + ': the removal took its organization row,'
                    + ' but its statement ran outside the take'
                    + ' (the flow read the roster during the'
                    + ' take: ' + String(readDuringTake)
                    + '; it waited on the paused removal: '
                    + String(blocked) + ')',
            );
        } finally {
            rosterSeam.release();
            flowSeam.release();
            await rosterSql.end();
            await flowSql.end();
            await probe.end();
        }
    });

    // The serializable histories of a program member created
    // under a paused flow write: the law refused the flow, or
    // the flow's head precedes the program's document.
    const assertProgramFollowsFlow = async (
        raced: RacedUnderPausedFlow,
        flowId: string,
        programPath: string,
        programId: string,
    ): Promise<void> => {
        assertStrictEquals(raced.rosterResponse.status, 201);
        const programHead = await db.messagePairs
            .getHeadPair(programPath, programId);
        assert(programHead !== null);
        const flowHead = await db.messagePairs
            .getHeadPair(FLOW_PREFIX, flowId);
        if (raced.flowResponse.status === 400) {
            assertEquals(await raced.flowResponse.json(), {
                error: 'memberIds may name person identities'
                    + ' only, not AI agents or services',
            });
            assertStrictEquals(flowHead, null);
            return;
        }
        assertStrictEquals(raced.flowResponse.status, 201);
        assert(flowHead !== null);
        assert(
            flowHead.response_at < programHead.response_at,
            'flow write landed at ' + flowHead.response_at
                + ', after the program document at '
                + programHead.response_at
                + ': the law judged a roster the program had'
                + ' not yet joined (the creation settled'
                + ' during the pause: '
                + String(raced.settledDuringPause)
                + '; it waited on the paused flow: '
                + String(raced.blocked) + ')',
        );
    };

    // A fresh id in memberIds names no program, so the law
    // admits it; the membership POST then makes it an AI
    // member in one statement with its seat.
    Deno.test('an AI member created under a paused flow PUT'
    + ' follows it or refuses it', async () => {
        const token = await organizationToken();
        const memberId = generateIdentifier();
        const flowId = generateIdentifier();
        const raced = await racedUnderPausedFlow(
            (paused) => handleRequest(paused, req(
                'PUT', FLOW_PREFIX + flowId, token,
                flowDocumentOf(
                    'Raced member',
                    generateIdentifier(),
                    {
                        nodes: [graphNode([memberId], [])],
                        edges: [],
                    },
                ),
                { 'if-none-match': '*' },
                generateIdentifier(),
            )),
            () => handleRequest(db, req(
                'POST', MEMBERSHIPS_ROUTE, token,
                aiMember(memberId, 'Raced member'),
            )),
        );
        await assertProgramFollowsFlow(
            raced, flowId, AI_AGENTS_PREFIX, memberId,
        );
    });

    // The create reads the same three collections in its
    // own transaction, so the same window would open there.
    Deno.test('an AI member created under a paused flow create'
    + ' follows it or refuses it', async () => {
        const token = await organizationToken();
        const memberId = generateIdentifier();
        const flowId = generateIdentifier();
        const raced = await racedUnderPausedFlow(
            (paused) => handleRequest(paused, req(
                'POST', FLOW_PREFIX, token,
                flowCreateSeating(flowId, memberId),
            )),
            () => handleRequest(db, req(
                'POST', MEMBERSHIPS_ROUTE, token,
                aiMember(memberId, 'Raced member'),
            )),
        );
        await assertProgramFollowsFlow(
            raced, flowId, AI_AGENTS_PREFIX, memberId,
        );
    });

    // A service member is the other program the law bars
    // from memberIds; its document lives under services/.
    Deno.test('a service member created under a paused flow'
    + ' PUT follows it or refuses it', async () => {
        const token = await organizationToken();
        const memberId = generateIdentifier();
        const flowId = generateIdentifier();
        const raced = await racedUnderPausedFlow(
            (paused) => handleRequest(paused, req(
                'PUT', FLOW_PREFIX + flowId, token,
                flowDocumentOf(
                    'Raced service',
                    generateIdentifier(),
                    {
                        nodes: [graphNode([memberId], [])],
                        edges: [],
                    },
                ),
                { 'if-none-match': '*' },
                generateIdentifier(),
            )),
            () => handleRequest(db, req(
                'POST', MEMBERSHIPS_ROUTE, token,
                serviceMember(memberId),
            )),
        );
        await assertProgramFollowsFlow(
            raced, flowId, SERVICES_PREFIX, memberId,
        );
    });

    // Flow writes share the organization row, so a second
    // flow lands while the first is paused holding it; the
    // runner's raced write is that second flow here. A flow
    // hold that took the row exclusive would queue every flow
    // save in the organization behind the slowest one.
    Deno.test('a flow PUT under a paused flow PUT of the same'
    + ' organization lands without waiting', async () => {
        const token = await organizationToken();
        const pausedId = generateIdentifier();
        const racingId = generateIdentifier();
        const raced = await racedUnderPausedFlow(
            (paused) => handleRequest(paused, req(
                'PUT', FLOW_PREFIX + pausedId, token,
                flowDocument('Paused', generateIdentifier()),
                { 'if-none-match': '*' },
                generateIdentifier(),
            )),
            () => handleRequest(db, req(
                'PUT', FLOW_PREFIX + racingId, token,
                flowDocument('Racing', generateIdentifier()),
                { 'if-none-match': '*' },
                generateIdentifier(),
            )),
        );
        assert(
            raced.settledDuringPause,
            'the racing flow PUT waited on the paused one'
                + ' (it waited on the paused flow: '
                + String(raced.blocked) + ')',
        );
        assertStrictEquals(raced.rosterResponse.status, 201);
        assertStrictEquals(raced.flowResponse.status, 201);
    });
}
