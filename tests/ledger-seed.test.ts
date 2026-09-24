import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert';
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
