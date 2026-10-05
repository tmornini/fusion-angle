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
import { sortFields } from
    '../shared/http-message/canonical.ts';
import { splitCredentials } from
    '../shared/http-message/credentials.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
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
    postMockDataLoad,
    rehearseBootstrap,
    rehearseMockData,
} from '../api/mock-data.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
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
    WO01_ID,
} from '../api/mock-data/seed-message-pairs.ts';
import { buildUnaffiliatedIdentity } from
    '../api/mock-data/members.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import type { MessagePairEntity } from '../shared/types.ts';

Deno.test(
    'a seed batch is half the binds the attempt leaves',
    () => {
        assertStrictEquals(POSTGRES_BIND_LIMIT, 65535);
        assertStrictEquals(LEADING_PARAMETERS, 1);
        assertStrictEquals(PARAMETERS_PER_ROW, 15);
        assertStrictEquals(SEED_ROWS_PER_STATEMENT, 2184);
        assertStrictEquals(
            LEADING_PARAMETERS
                + SEED_ROWS_PER_STATEMENT * PARAMETERS_PER_ROW,
            32761,
        );
    },
);

Deno.test(
    'the statement binds the attempt, then fifteen a row',
    () => {
        const text = statementText(2);
        assertStringIncludes(text, '$1::text');
        assertStringIncludes(text, '$2::uuid');
        assertStringIncludes(text, '$31::text');
        assertStrictEquals(text.includes('$32'), false);
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
    return ideaPairAt(IDEA, method, title, genesis);
}

function ideaPairAt(
    idea: string,
    method: 'PUT' | 'DELETE',
    title: string,
    genesis: boolean,
): Promise<MessagePair> {
    const operationId = generateIdentifier();
    const body = method === 'DELETE' ? undefined : { title };
    return formWriteMessagePair({
        method,
        pathname: '/organizations/' + ORGANIZATION
            + '/ideas/' + idea,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments: [
            'organizations', ORGANIZATION, 'ideas', idea,
        ],
        headerFields: [],
        body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-09-23T00:00:00.000000Z',
        organization: ORGANIZATION,
        responseBody: body,
        operationId,
        requestId: operationId,
        ...(genesis ? { genesis: 'handler' as const } : {}),
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

Deno.test(
    'a wave of concurrent writes records each predecessor',
    async () => {
        const ideas = [fresh(), fresh(), fresh()];
        const geneses = await Promise.all(ideas.map(
            (idea) => ideaPairAt(idea, 'PUT', 'Fresh', true),
        ));
        const successors = await Promise.all(ideas.map(
            (idea) => ideaPairAt(idea, 'PUT', 'Again', false),
        ));
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await Promise.all(
                    geneses.map((pair) => write(db, pair)),
                );
                await Promise.all(
                    successors.map((pair) => write(db, pair)),
                );
            },
        );
        const depths = depthsOf(statements);
        const recorded = new Map(statements.map(
            (statement, index) => [
                statement.rows[0]!.id,
                {
                    supersedes: statement.supersedes[0],
                    depth: depths[index],
                },
            ],
        ));
        assertStrictEquals(statements.length, 6);
        assertStrictEquals(recorded.size, 6);
        geneses.forEach((genesis, index) => {
            assertEquals(
                recorded.get(genesis.id),
                { supersedes: NIL, depth: 1 },
            );
            assertEquals(
                recorded.get(successors[index]!.id),
                { supersedes: genesis.id, depth: 2 },
            );
        });
        const backend = new MemoryStorageBackend();
        await postSeedLanding(
            backend, { seedRunId: fresh(), statements },
        );
        assertStrictEquals(backend.statementExecutions(), 2);
    },
);

Deno.test(
    'a write inside an op\'s own transaction is recorded',
    async () => {
        const pair = await ideaPair('PUT', 'Fresh', true);
        const statements = await rehearse(
            new MemoryStorageBackend(),
            (db) => db.backend.transaction(
                'readwrite',
                (tx) => write(db.clientOn(tx), pair),
            ),
        );
        assertEquals(
            statements.map((s) => s.rows.map((r) => r.id)),
            [[pair.id]],
        );
    },
);

Deno.test(
    'a read inside the rehearsal sees the run\'s writes',
    async () => {
        const pair = await ideaPair('PUT', 'Fresh', true);
        await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await write(db, pair);
                const head = await db.messagePairs.getHeadPair(
                    '/organizations/' + ORGANIZATION
                        + '/ideas/',
                    IDEA,
                );
                assertStrictEquals(head?.id, pair.id);
            },
        );
    },
);

Deno.test(
    'two writers of one document in a wave fail the seed',
    async () => {
        const first = await ideaPair('PUT', 'Fresh', true);
        const second = await ideaPair('PUT', 'Again', false);
        await assertRejects(
            () => rehearse(
                new MemoryStorageBackend(),
                async (db) => {
                    await Promise.all([
                        write(db, first),
                        write(db, second),
                    ]);
                },
            ),
            Error,
            'seed statement returned refused',
        );
    },
);

Deno.test(
    'a failed rehearsal adopts nothing on its scratch',
    async () => {
        const scratch = new MemoryStorageBackend();
        const pair = await ideaPair('PUT', 'Fresh', true);
        await assertRejects(
            () => rehearse(scratch, async (db) => {
                await write(db, pair);
                throw new Error('stop the rehearsal');
            }),
            Error,
            'stop the rehearsal',
        );
        assertStrictEquals(
            (await scratch.read((tx) => tx.getAll())).length,
            1,
        );
    },
);

Deno.test(
    'the scratch\'s schema calls are refused mid-rehearsal',
    async () => {
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await assertRejects(
                    () => db.backend.ensureTable(),
                    Error,
                    'ensureTable called during the open seed'
                        + ' rehearsal',
                );
                await assertRejects(
                    () => db.backend.seedTransaction(
                        async () => {},
                    ),
                    Error,
                    'seedTransaction called during the open'
                        + ' seed rehearsal',
                );
                await assertRejects(
                    () => db.backend.postSchemaCreation(),
                    Error,
                    'postSchemaCreation called during the open'
                        + ' seed rehearsal',
                );
            },
        );
        assertStrictEquals(statements.length, 0);
    },
);

Deno.test(
    'a wave\'s statements are recorded in call order',
    async () => {
        const slow = await Promise.all(
            [fresh(), fresh(), fresh(), fresh()].map(
                (idea) => ideaPairAt(idea, 'PUT', 'Fresh', true),
            ),
        );
        const quick = await ideaPairAt(
            fresh(), 'PUT', 'Fresh', true,
        );
        const statements = await rehearse(
            new MemoryStorageBackend(),
            async (db) => {
                await Promise.all([
                    runWrite(db, attemptFor(slow), slow),
                    write(db, quick),
                ]);
            },
        );
        assertEquals(
            statements.map((s) => s.rows.map((r) => r.id)),
            [slow.map((pair) => pair.id), [quick.id]],
        );
    },
);

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
            assertStrictEquals(row.request_secrets, '');
            assertStrictEquals(row.response_secrets, '');
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
    'mock data lands every rehearsed row in thirteen'
        + ' statements, one per chain depth',
    async () => {
        const backend = new MemoryStorageBackend();
        const seed = await rehearseMockData({
            hashPassword: testHashPassword,
        });
        await postSeedLanding(backend, seed.rehearsal);
        // The deepest chain is a work order's: thirteen
        // versions (measurements/probes/seed/shape.ts,
        // maxDepth).
        assertStrictEquals(backend.statementExecutions(), 13);
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

// Credential lines serialize last, but a stored message
// holds none, so its bytes (and every digest over them)
// are the plain name order they were before that rule.
Deno.test(
    'a mock-data seed stores every message in name order',
    async () => {
        const rows = await (await sharedMockDb())
            .messagePairs.getAll();
        let checked = 0;
        for (const row of rows) {
            for (const message of [row.request, row.response]) {
                if (message === '') continue;
                const model = parseWire(message);
                assertStrictEquals(
                    splitCredentials(model.fields).hoisted.length,
                    0,
                );
                const end = message.indexOf('\r\n\r\n');
                let head = message.slice(
                    0, message.indexOf('\r\n') + 2,
                );
                for (const field of sortFields(model.fields)) {
                    head += field.name + ': ' + field.value
                        + '\r\n';
                }
                assertStrictEquals(
                    message.slice(0, end + 2), head,
                );
                checked += 1;
            }
        }
        assert(checked > 0);
    },
);

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
            assertStrictEquals(row.request_secrets, '');
            assertStrictEquals(row.response_secrets, '');
        }
    },
);

Deno.test('every seeded row stores an empty request',
async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    const nonEmpty = (await db.messagePairs.getAll())
        .filter((row) => row.request !== '')
        .map((row) => row.path + row.name);
    assertEquals(nonEmpty, []);
});

Deno.test(
    'the seeded invitation is the grant route\'s POST',
    async () => {
        const rows = await (await sharedMockDb())
            .messagePairs.getAll();
        const riley = buildUnaffiliatedIdentity().id;
        const name = membershipNameOf(
            STARK_ORGANIZATION, riley,
        );
        const put = rows.find((row) =>
            row.path === '/invitations/'
            && row.name === name
            && row.method === 'PUT');
        const operation = rows.find((row) =>
            row.path === '/invitations/' + name + '/'
            && row.name === 'pending');
        assert(put !== undefined && operation !== undefined);
        assertStrictEquals(operation.method, 'POST');
        const invitation = JSON.parse(
            HttpMessage.fromWire(put.response).body().toText(),
        ) as Record<string, unknown>;
        assertStrictEquals(
            invitation['organization_id'], STARK_ORGANIZATION,
        );
        assertStrictEquals(invitation['identity_id'], riley);
        assertStrictEquals(
            invitation['id'], name,
        );
        assertStrictEquals(
            operation.operation_id, put.operation_id,
        );
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
                statement.rows.length === 3
                && statement.rows[0]!.method === 'POST'
                && statement.rows[0]!.path === transitionPath);
        // WO01's chain places them third and fourth: each
        // lands the work order's next version.
        assertEquals(
            latched.map(({ depth }) => depth), [3, 4],
        );
        const create = statements.find((statement) =>
            statement.rows.some((row) =>
                row.method === 'PATCH'
                && row.name === SEED_INSTANCE_ID));
        assert(create !== undefined);
        const genesis = create.rows.find(
            (row) => row.method === 'PUT',
        );
        assert(genesis !== undefined);
        const priorHeads = [
            genesis.id, latched[0]!.statement.rows[2]!.id,
        ];
        latched.forEach(({ statement }, index) => {
            const revision = statement.rows[2]!;
            assertStrictEquals(revision.method, 'PUT');
            assertStrictEquals(revision.name, SEED_INSTANCE_ID);
            assertStrictEquals(
                statement.supersedes[2], priorHeads[index],
            );
        });
    },
);
