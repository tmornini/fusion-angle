import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    LEADING_PARAMETERS,
    PARAMETERS_PER_ROW,
    statementText,
} from '../api/ledger-statement-sql.ts';
import {
    depthsOf,
    packSeedBatches,
    POSTGRES_BIND_LIMIT,
    SEED_ROWS_PER_STATEMENT,
    type RehearsedStatement,
    withoutRequestIdLine,
    rehearse,
    postSeedLanding,
} from '../api/ledger-seed.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { rootBind } from '../api/ledger-root.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import {
    generateIdentifier,
    NIL_IDENTIFIER,
} from '../shared/identifier.ts';
import type { StatementBind } from
    '../shared/ledger-statement.ts';
import { Octets } from '../shared/http-message/octets.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    attemptFor,
    formWriteMessagePair,
    runWrite,
    type MessagePair,
} from '../api/message-pair.ts';
import {
    sharedMockDb,
    testHashPassword,
} from './mock-seed.ts';
import {
    rehearseBootstrap,
    rehearseMockData,
} from '../api/mock-data.ts';
import { buildFlows } from '../api/mock-data/flows.ts';
import {
    buildRecords,
    buildRecordAttributes,
} from '../api/mock-data/records.ts';
import { OBJECTIVE_SEEDS } from
    '../api/mock-data/objectives.ts';
import {
    mockProjectFlows,
    SEED_INSTANCE_ID,
    UNAFFILIATED_INVITATION_ID,
    WO01_ID,
} from '../api/mock-data/seed-message-pairs.ts';
import { buildUnaffiliatedIdentity } from
    '../api/mock-data/members.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import type { MessagePairEntity } from '../api/types.ts';

Deno.test(
    'a seed batch is half the binds the attempt leaves',
    () => {
        assertStrictEquals(POSTGRES_BIND_LIMIT, 65535);
        assertStrictEquals(LEADING_PARAMETERS, 1);
        assertStrictEquals(PARAMETERS_PER_ROW, 14);
        assertStrictEquals(SEED_ROWS_PER_STATEMENT, 2340);
        assertStrictEquals(
            LEADING_PARAMETERS
                + SEED_ROWS_PER_STATEMENT * PARAMETERS_PER_ROW,
            32761,
        );
    },
);

Deno.test(
    'the statement binds the attempt, then fourteen a row',
    () => {
        const text = statementText(2);
        assertStringIncludes(text, '$1::text');
        assertStringIncludes(text, '$2::uuid');
        assertStringIncludes(text, '$29::text');
        assertStrictEquals(text.includes('$30'), false);
    },
);

function rowBind(id: string): StatementBind {
    return {
        ...rootBind(generateIdentifier()),
        id,
        path: '/t/',
        name: id,
    };
}

function recorded(
    ids: readonly string[],
    supersedes: readonly string[],
): RehearsedStatement {
    return { rows: ids.map(rowBind), supersedes };
}

const NIL = NIL_IDENTIFIER;
const fresh = (): string => generateIdentifier();

Deno.test(
    'a chain of versions takes depths one, two, three',
    () => {
        const [a, b, c, d] = [fresh(), fresh(), fresh(), fresh()];
        assertEquals(depthsOf([
            recorded([a], [NIL]),
            recorded([b], [a]),
            recorded([c, d], [NIL, b]),
        ]), [1, 2, 3]);
    },
);

Deno.test(
    'a row that supersedes no earlier row fails the plan',
    () => {
        assertThrows(
            () => depthsOf([recorded([fresh()], [fresh()])]),
            Error,
            'seed row supersedes a row no earlier'
                + ' statement wrote',
        );
    },
);

Deno.test(
    'the packer fills each depth in order, never splitting',
    () => {
        const s1 = recorded([fresh(), fresh()], [NIL, NIL]);
        const s2 = recorded([fresh()], [s1.rows[0]!.id]);
        const s3 = recorded([fresh(), fresh()], [NIL, NIL]);
        const s4 = recorded([fresh()], [NIL]);
        const statements = [s1, s2, s3, s4];
        const batches = packSeedBatches(
            statements, depthsOf(statements), 3,
        );
        const ids = (s: RehearsedStatement) =>
            s.rows.map((row) => row.id);
        assertEquals(batches.map(ids), [
            ids(s1),
            [...ids(s3), ...ids(s4)],
            ids(s2),
        ]);
        assertEquals(batches[1]!.supersedes, [NIL, NIL, NIL]);
    },
);

Deno.test(
    'a statement longer than the row limit fails the plan',
    () => {
        const long = recorded(
            [fresh(), fresh(), fresh(), fresh()],
            [NIL, NIL, NIL, NIL],
        );
        assertThrows(
            () => packSeedBatches([long], [1], 3),
            Error,
            'seed statement exceeds the batch row limit',
        );
    },
);

function suffixed(suffix: string): StatementBind {
    return {
        ...rootBind(generateIdentifier()),
        responseSuffix: Octets.fromLatin1(suffix).asBytes(),
    };
}

function latin1(bytes: Uint8Array): string {
    return Octets.fromBytes(bytes).toLatin1();
}

Deno.test('the request-id line leaves a seed row', () => {
    const bind = suffixed(
        '\r\netag: "e"\r\noperation-id: o\r\n'
            + 'request-id: r\r\n\r\n{"a":1}',
    );
    const kept = withoutRequestIdLine(bind);
    assertStrictEquals(
        latin1(kept.responseSuffix),
        '\r\netag: "e"\r\noperation-id: o\r\n\r\n{"a":1}',
    );
    assertEquals(kept.responsePrefix, bind.responsePrefix);
});

Deno.test('a body that names request-id keeps its bytes', () => {
    const body = '\r\nrequest-id: in-body';
    const kept = withoutRequestIdLine(
        suffixed('\r\nrequest-id: r\r\n\r\n' + body),
    );
    assertStrictEquals(
        latin1(kept.responseSuffix), '\r\n\r\n' + body,
    );
});

Deno.test(
    'a seed row without a request-id line fails the plan',
    () => {
        assertThrows(
            () => withoutRequestIdLine(
                suffixed('\r\netag: "e"\r\n\r\n'),
            ),
            Error,
            'seed row carries no request-id line',
        );
        assertThrows(
            () => withoutRequestIdLine(
                suffixed('\r\n\r\n\r\nrequest-id: body'),
            ),
            Error,
            'seed row carries no request-id line',
        );
    },
);

Deno.test(
    'a seed transaction that throws leaves no table',
    async () => {
        const backend = new MemoryStorageBackend();
        await assertRejects(
            () => backend.seedTransaction(async (tx) => {
                await backend.executeLedger(
                    'composed',
                    [rootBind(generateIdentifier())],
                    undefined,
                    tx,
                );
                throw new Error('stop the seed');
            }),
            Error,
            'stop the seed',
        );
        assertStrictEquals(await backend.hasSchema(), false);
    },
);

Deno.test(
    'a seed transaction creates the table with its rows',
    async () => {
        const backend = new MemoryStorageBackend();
        const answers = await backend.seedTransaction(
            (tx) => backend.executeLedger(
                'composed',
                [rootBind(generateIdentifier())],
                undefined,
                tx,
            ),
        );
        assertStrictEquals(answers[0]?.outcome, 'land');
        assertStrictEquals(await backend.hasSchema(), true);
        const rows = await backend.read(
            (tx) => tx.getAll(),
        );
        assertStrictEquals(rows.length, 1);
    },
);

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const IDEA = 'XufQcWIKhZshfJYOVNeUSw';

function ideaPair(
    method: 'PUT' | 'DELETE',
    title: string,
    genesis: boolean,
): Promise<MessagePair> {
    const operationId = generateIdentifier();
    const body = method === 'DELETE' ? undefined : { title };
    return formWriteMessagePair({
        method,
        pathname: '/organizations/' + ORGANIZATION
            + '/ideas/' + IDEA,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments: [
            'organizations', ORGANIZATION, 'ideas', IDEA,
        ],
        headerFields: [],
        body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-09-23T00:00:00.000000Z',
        organization: ORGANIZATION,
        responseBody: body,
        operationId,
        requestId: operationId,
        ...(genesis ? { genesis: true as const } : {}),
    });
}

async function write(
    db: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    await runWrite(db, attemptFor([pair]), [pair]);
}

Deno.test(
    'the rehearsal records each statement and predecessor',
    async () => {
        const first = await ideaPair('PUT', 'Fresh', true);
        const second = await ideaPair('PUT', 'Again', false);
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await write(db, first);
                await write(db, second);
            },
        );
        assertStrictEquals(statements.length, 2);
        assertEquals(
            statements.map((s) => s.rows.map((r) => r.id)),
            [[first.id], [second.id]],
        );
        assertEquals(
            statements.map((s) => s.supersedes),
            [[NIL_IDENTIFIER], [first.id]],
        );
    },
);

Deno.test('a matched row fails the rehearsal', async () => {
    const first = await ideaPair('PUT', 'Same', true);
    const resend = await ideaPair('PUT', 'Same', false);
    await assertRejects(
        () => rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await write(db, first);
                await write(db, resend);
            },
        ),
        Error,
        'seed statement returned matched',
    );
});

Deno.test('a refused row fails the rehearsal', async () => {
    const scratch = new MemoryStorageBackend();
    await scratch.ensureTable();
    scratch.refuseNextSuccessions(1);
    const pair = await ideaPair('PUT', 'Fresh', true);
    await assertRejects(
        () => rehearse(scratch, (db) => write(db, pair)),
        Error,
        'seed statement returned refused',
    );
});

function adapterOver(
    backend: MemoryStorageBackend,
): BackedDbAdapter {
    return new BackedDbAdapter(
        backend, async () => {}, async () => {}, () => {},
    );
}

async function recreatedChain(): Promise<{
    readonly pairs: readonly MessagePair[];
    readonly statements: readonly RehearsedStatement[];
}> {
    const pairs = [
        await ideaPair('PUT', 'Fresh', true),
        await ideaPair('DELETE', '', false),
        await ideaPair('PUT', 'Back', false),
    ];
    const statements = await rehearse(
        new MemoryStorageBackend(),
        async (db) => {
            for (const pair of pairs) await write(db, pair);
        },
    );
    return { pairs, statements };
}

Deno.test(
    'a re-created document lands by depth and stores 201',
    async () => {
        const { pairs, statements } = await recreatedChain();
        assertEquals(depthsOf(statements), [1, 2, 3]);
        const backend = new MemoryStorageBackend();
        const seedRunId = generateIdentifier();
        await postSeedLanding(
            backend, { seedRunId, statements },
        );
        assertStrictEquals(backend.statementExecutions(), 3);
        const rows = new Map(
            (await adapterOver(backend).messagePairs.getAll())
                .map((row) => [row.id, row]),
        );
        const [put, removal, again] = pairs;
        assertStrictEquals(
            rows.get(put!.id)?.supersedes, NIL,
        );
        assertStrictEquals(
            rows.get(removal!.id)?.supersedes, put!.id,
        );
        assertStrictEquals(
            rows.get(again!.id)?.supersedes, removal!.id,
        );
        assertStrictEquals(
            rows.get(again!.id)?.response
                .startsWith('HTTP/1.1 201 '),
            true,
        );
    },
);

Deno.test(
    'the root carries the run id; no row keeps request-id',
    async () => {
        const { statements } = await recreatedChain();
        const backend = new MemoryStorageBackend();
        const seedRunId = generateIdentifier();
        await postSeedLanding(
            backend, { seedRunId, statements },
        );
        const rows = await adapterOver(backend)
            .messagePairs.getAll();
        const carriers = rows.filter(
            (row) => row.operation_id === seedRunId,
        );
        assertStrictEquals(carriers.length, 1);
        assertStrictEquals(carriers[0]!.path, '/migrations/');
        for (const row of rows) {
            assertStrictEquals(
                row.response.includes('\r\nrequest-id: '),
                false,
            );
            assertStrictEquals(row.secret, '');
        }
    },
);

Deno.test(
    'a failed landing leaves no table, then a retry lands',
    async () => {
        const { statements } = await recreatedChain();
        const backend = new MemoryStorageBackend();
        const rehearsal = {
            seedRunId: generateIdentifier(),
            statements,
        };
        backend.refuseNextSuccessions(1);
        await assertRejects(
            () => postSeedLanding(backend, rehearsal),
        );
        assertStrictEquals(await backend.hasSchema(), false);
        await postSeedLanding(backend, rehearsal);
        assertStrictEquals(await backend.hasSchema(), true);
        assertStrictEquals(
            (await adapterOver(backend).messagePairs.getAll())
                .length,
            4,
        );
    },
);

Deno.test(
    'a matched rehearsal leaves the target without a table',
    async () => {
        const backend = new MemoryStorageBackend();
        const first = await ideaPair('PUT', 'Same', true);
        const resend = await ideaPair('PUT', 'Same', false);
        await assertRejects(
            async () => {
                const statements = await rehearse(
                    new MemoryStorageBackend(),
                    async (db) => {
                        await write(db, first);
                        await write(db, resend);
                    },
                );
                await postSeedLanding(backend, {
                    seedRunId: generateIdentifier(),
                    statements,
                });
            },
            Error,
            'seed statement returned matched',
        );
        assertStrictEquals(await backend.hasSchema(), false);
    },
);

Deno.test(
    'a landing onto an existing table changes nothing',
    async () => {
        const { statements } = await recreatedChain();
        const backend = new MemoryStorageBackend();
        await backend.ensureTable();
        const before = await adapterOver(backend)
            .messagePairs.getAll();
        await assertRejects(
            () => postSeedLanding(backend, {
                seedRunId: generateIdentifier(),
                statements,
            }),
            Error,
            'seed statement returned matched',
        );
        assertEquals(
            await adapterOver(backend).messagePairs.getAll(),
            before,
        );
    },
);

// Every mock-data row that shares the operation id of the
// one row `anchor` picks.
async function operationRowsOf(
    anchor: (row: MessagePairEntity) => boolean,
): Promise<MessagePairEntity[]> {
    const rows = await (await sharedMockDb())
        .messagePairs.getAll();
    const found = rows.find(anchor);
    if (found === undefined) {
        throw new Error('no seed row matches the anchor');
    }
    return rows.filter(
        (row) => row.operation_id === found.operation_id,
    );
}

Deno.test(
    'a flow creation\'s three rows share one id',
    async () => {
        const flow = buildFlows()[0]!;
        const join = mockProjectFlows.find(
            (pf) => pf.flow_id === flow.id,
        )!;
        const flows = '/organizations/' + STARK_ORGANIZATION
            + '/flows/';
        const rows = await operationRowsOf((row) =>
            row.path === flows && row.name === flow.id
            && row.method === 'POST');
        assertEquals(
            rows.map((row) => row.path + row.name).sort(),
            [
                flows + flow.id,
                flows + flow.id,
                '/organizations/' + STARK_ORGANIZATION
                    + '/projects/' + join.project_id
                    + '/flows/' + join.id,
            ].sort(),
        );
    },
);

Deno.test(
    'a record write\'s rows and an objective\'s share ids',
    async () => {
        const record = buildRecords()[0]!;
        const attributes = buildRecordAttributes().filter(
            (a) => a.record_id === record.id,
        );
        assertStrictEquals(
            (await operationRowsOf((row) =>
                row.name === record.id
                && row.method === 'POST')).length,
            2 + attributes.length,
        );
        const objective = OBJECTIVE_SEEDS[0]!;
        assertStrictEquals(
            (await operationRowsOf((row) =>
                row.name === objective.id
                && row.method === 'POST')).length,
            3,
        );
    },
);

Deno.test(
    'a single-pair operation keeps an id of its own',
    async () => {
        const ideas = '/organizations/' + STARK_ORGANIZATION
            + '/ideas/';
        assertStrictEquals(
            (await operationRowsOf((row) =>
                row.path === ideas
                && row.method === 'PUT')).length,
            1,
        );
    },
);

Deno.test(
    'mock data lands every rehearsed row in three'
        + ' statements',
    async () => {
        const backend = new MemoryStorageBackend();
        const seed = await rehearseMockData({
            hashPassword: testHashPassword,
        });
        await postSeedLanding(backend, seed.rehearsal);
        assertStrictEquals(backend.statementExecutions(), 3);
        const landed = new Map(
            (await adapterOver(backend).messagePairs.getAll())
                .map((row) => [row.id, row]),
        );
        let rehearsed = 0;
        for (const statement of seed.rehearsal.statements) {
            statement.rows.forEach((row, index) => {
                rehearsed += 1;
                assertStrictEquals(
                    landed.get(row.id)?.supersedes,
                    statement.supersedes[index],
                );
            });
        }
        assertStrictEquals(landed.size, rehearsed + 1);
    },
);

Deno.test('bootstrap lands in one statement', async () => {
    const backend = new MemoryStorageBackend();
    const seed = await rehearseBootstrap({
        hashPassword: testHashPassword,
    });
    await postSeedLanding(backend, seed.rehearsal);
    assertStrictEquals(backend.statementExecutions(), 1);
    assertStrictEquals(
        (await adapterOver(backend).messagePairs.getAll())
            .length,
        9,
    );
});

Deno.test(
    'a mock-data seed keeps no request-id and no secret',
    async () => {
        const db = await sharedMockDb();
        const rows = await db.messagePairs.getAll();
        const root = rows.filter(
            (row) => row.path === '/migrations/',
        );
        assertStrictEquals(root.length, 1);
        assertStrictEquals(
            rows.filter((row) =>
                row.operation_id === root[0]!.operation_id,
            ).length,
            1,
        );
        for (const row of rows) {
            assertStrictEquals(
                row.response.includes('\r\nrequest-id: '),
                false,
            );
            assertStrictEquals(row.secret, '');
        }
    },
);

Deno.test(
    'the seeded invitation is the grant route\'s POST',
    async () => {
        const rows = await (await sharedMockDb())
            .messagePairs.getAll();
        const at = rows.filter((row) =>
            row.path === '/invitations/'
            && row.name === UNAFFILIATED_INVITATION_ID);
        const post = at.find((row) => row.method === 'POST');
        const put = at.find((row) => row.method === 'PUT');
        assert(post !== undefined && put !== undefined);
        assertStrictEquals(
            post.request.startsWith(
                'POST /organizations/' + STARK_ORGANIZATION
                    + '/invitations/ HTTP/1.1\r\n',
            ),
            true,
        );
        const body = JSON.parse(
            HttpMessage.fromWire(post.request).body().toText(),
        ) as Record<string, unknown>;
        assertStrictEquals(
            body['email'], buildUnaffiliatedIdentity().email,
        );
        assertStrictEquals(post.operation_id, put.operation_id);
    },
);

Deno.test(
    'the instance create lands as one PATCH and PUT',
    async () => {
        const seed = await rehearseMockData({
            hashPassword: testHashPassword,
        });
        const statements = seed.rehearsal.statements;
        const create = statements.find((statement) =>
            statement.rows.some((row) =>
                row.method === 'PATCH'
                && row.name === SEED_INSTANCE_ID));
        assert(create !== undefined);
        assertEquals(
            create.rows.map((row) => row.method),
            ['PATCH', 'PUT'],
        );
        assertEquals(create.supersedes, [NIL, NIL]);
        assertStrictEquals(
            depthsOf(statements)[statements.indexOf(create)],
            1,
        );
    },
);

Deno.test(
    'each value-bearing transition is one latched statement',
    async () => {
        const seed = await rehearseMockData({
            hashPassword: testHashPassword,
        });
        const statements = seed.rehearsal.statements;
        const depths = depthsOf(statements);
        const transitionPath = '/organizations/'
            + STARK_ORGANIZATION + '/work-orders/' + WO01_ID
            + '/transition/';
        const latched = statements
            .map((statement, index) => ({
                statement,
                depth: depths[index],
            }))
            .filter(({ statement }) =>
                statement.rows.length === 2
                && statement.rows[0]!.method === 'POST'
                && statement.rows[0]!.path === transitionPath);
        assertEquals(
            latched.map(({ depth }) => depth), [2, 3],
        );
        for (const { statement } of latched) {
            const revision = statement.rows[1]!;
            assertStrictEquals(revision.method, 'PUT');
            assertStringIncludes(
                latin1(revision.request),
                'if-match: "' + statement.supersedes[1]!
                    + '"\r\n',
            );
        }
    },
);
