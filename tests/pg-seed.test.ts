import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertNotMatch,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    hasSchemaMarker,
} from '../server/boot.ts';
import {
    assertEmptyDatabase,
    formatSeededCredentials,
    isDatabaseEmpty,
    parseSeedArgv,
    SEED_EXCLUSIVE_FLAGS,
    SEED_NONEMPTY,
    SEED_REVEAL_HEADER,
    seedErrorMessage,
    seedPostgres,
    serialPasswordHasher,
} from '../server/seed.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { TABLE_NAMES } from '../api/db.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { testHashPassword } from './mock-seed.ts';

function fakeClient(
    rows: Record<string, unknown>[],
): {
    readonly sql: SqlClient;
    readonly texts: string[];
} {
    const texts: string[] = [];
    const sql: SqlClient = {
        query: <T>(
            strings: TemplateStringsArray,
            ..._values: unknown[]
        ) => {
            texts.push(strings.join(''));
            return Promise.resolve(rows as T[]);
        },
        begin: async (fn) => fn(sql),
        unsafe: async <T>(query: string) => {
            texts.push(query);
            return [] as T[];
        },
        end: async () => {},
    };
    return { sql, texts };
}

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function schemaName(): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + '_seed';
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

Deno.test('parseSeedArgv accepts one mode flag', () => {
    assertEquals(
        parseSeedArgv(['--bootstrap']),
        { kind: 'ok', mode: 'bootstrap' },
    );
    assertEquals(
        parseSeedArgv(['--mock-data']),
        { kind: 'ok', mode: 'mock-data' },
    );
});

Deno.test('parseSeedArgv help is kind help', () => {
    assertEquals(
        parseSeedArgv(['--help']),
        { kind: 'help' },
    );
    assertEquals(
        parseSeedArgv(['-h']),
        { kind: 'help' },
    );
});

Deno.test('parseSeedArgv none two unknown', () => {
    const none = parseSeedArgv([]);
    assertStrictEquals(none.kind, 'error');
    if (none.kind !== 'error') return;
    assertStrictEquals(
        none.message,
        SEED_EXCLUSIVE_FLAGS,
    );
    const two = parseSeedArgv([
        '--bootstrap', '--mock-data',
    ]);
    assertStrictEquals(two.kind, 'error');
    if (two.kind !== 'error') return;
    assertStrictEquals(
        two.message,
        SEED_EXCLUSIVE_FLAGS,
    );
    const unknown = parseSeedArgv(['--pristine']);
    assertStrictEquals(unknown.kind, 'error');
    if (unknown.kind !== 'error') return;
    assertMatch(unknown.message, /unknown/i);
});

Deno.test('seedErrorMessage never echoes a URL', () => {
    assertStrictEquals(
        seedErrorMessage(new Error(
            'connect postgres://user:pw@h/db',
        )),
        'seed failed',
    );
    assertStrictEquals(
        seedErrorMessage(new Error(SEED_NONEMPTY)),
        SEED_NONEMPTY,
    );
    assertStrictEquals(
        seedErrorMessage(
            new Error(SEED_EXCLUSIVE_FLAGS),
        ),
        SEED_EXCLUSIVE_FLAGS,
    );
});

Deno.test('isDatabaseEmpty is true when no rows exist',
async () => {
    const empty = fakeClient([{
        message_pairs: false,
        marker: false,
    }]);
    assertStrictEquals(await isDatabaseEmpty(empty.sql), true);
    assertMatch(
        empty.texts[0] ?? '', /FROM message_pairs/,
    );
    assertMatch(empty.texts[0] ?? '', /schema_marker/);
});

Deno.test('assertEmptyDatabase refuses any message row',
async () => {
    const nonempty = fakeClient([{
        message_pairs: true,
        marker: false,
    }]);
    const error = await assertRejects(
        () => assertEmptyDatabase(nonempty.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, SEED_NONEMPTY);
});

Deno.test('assertEmptyDatabase refuses a marker row',
async () => {
    const marked = fakeClient([{
        message_pairs: false,
        marker: true,
    }]);
    const error = await assertRejects(
        () => assertEmptyDatabase(marked.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, SEED_NONEMPTY);
});

Deno.test('postgres-seed refuses leftover pairs before DDL',
() => {
    const src = Deno.readTextFileSync(
        'server/postgres-seed.ts',
    );
    const legacy = src.indexOf(
        'assertNoLegacyMessageTables',
    );
    const ensure = src.indexOf('ensureTables');
    assert(legacy >= 0);
    assert(ensure >= 0);
    assert(legacy < ensure);
});

Deno.test('serial hasher never overlaps', async () => {
    let current = 0;
    let max = 0;
    const hash = serialPasswordHasher(async (text) => {
        current += 1;
        max = Math.max(max, current);
        await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });
        current -= 1;
        return text;
    });
    await Promise.all(['a', 'b', 'c'].map((text) =>
        hash(text),
    ));
    assertStrictEquals(max, 1);
});

Deno.test('formatSeededCredentials is terminal text', () => {
    const text = formatSeededCredentials({
        identities: [{
            identityId: 'XXZruirZyAOoRpNxaDnpSA',
            username: 'demo@example.com',
            password: 'secret-once',
        }],
    });
    assert(text.includes(SEED_REVEAL_HEADER));
    assertMatch(text, /demo@example.com\tsecret-once/);
    assertNotMatch(text, /"level":/);
});

Deno.test('non-empty refuses without seeding or printing',
async () => {
    const db = memoryDbAdapter();
    const nonempty = fakeClient([{
        message_pairs: true,
        marker: false,
    }]);
    let wrote = false;
    const error = await assertRejects(
        () => seedPostgres(
            nonempty.sql, db, 'bootstrap', {
                hashPassword: testHashPassword,
                write: () => {
                    wrote = true;
                },
            },
        ),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, SEED_NONEMPTY);
    assertStrictEquals(wrote, false);
    assertStrictEquals(await db.hasSchema(), false);
});

Deno.test('seedPostgres seeds when mode is required',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        message_pairs: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await seedPostgres(
        empty.sql, db, 'bootstrap', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        },
    );
    const printed = chunks.join('');
    assertMatch(printed, /demo@example.com\t/);
    assert(printed.includes(SEED_REVEAL_HEADER));
    assertStrictEquals(await db.hasSchema(), true);
    assertStrictEquals(chunks.length, 1);
});

Deno.test('bootstrap seed prints credentials once',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        message_pairs: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await seedPostgres(
        empty.sql, db, 'bootstrap', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        },
    );
    const printed = chunks.join('');
    assertMatch(printed, /demo@example.com\t/);
    assert(printed.includes(SEED_REVEAL_HEADER));
    assertStrictEquals(await db.hasSchema(), true);
    assertStrictEquals(chunks.length, 1);
});

Deno.test('mock-data seed prints every human sign-in',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        message_pairs: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await seedPostgres(
        empty.sql, db, 'mock-data', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        },
    );
    const printed = chunks.join('');
    assertStrictEquals(
        printed.split('\n').filter((line) =>
            line.includes('\t'),
        ).length,
        12,
    );
    assert(printed.includes(SEED_REVEAL_HEADER));
    assertStrictEquals(await db.hasSchema(), true);
});

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'live seed skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);
    const adapter = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await adapter.ensureTables(TABLE_NAMES);
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

    Deno.test('live empty bootstrap seeds then refuses',
    async () => {
        assertStrictEquals(await isDatabaseEmpty(sql), true);
        const chunks: string[] = [];
        await seedPostgres(sql, adapter, 'bootstrap', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        });
        assertStrictEquals(await hasSchemaMarker(sql), true);
        assertStrictEquals(await isDatabaseEmpty(sql), false);
        assertMatch(
            chunks.join(''),
            /demo@example.com\t/,
        );
        const error = await assertRejects(
            () => seedPostgres(
                sql, adapter, 'bootstrap', {
                    hashPassword: testHashPassword,
                    write: () => {},
                },
            ),
        ) as Error;
        assertInstanceOf(error, Error);
        assertStrictEquals(error.message, SEED_NONEMPTY);
    });
}
