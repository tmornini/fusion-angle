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
} from '../api/ledger-seed.ts';
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
