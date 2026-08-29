import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const POSTGRES_URL = process.env['POSTGRES_URL'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function schemaName(): string {
    const base = process.env['SCHEMA_NAME']
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(process.pid)
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

test('parseSeedArgv accepts one mode flag', () => {
    assert.deepEqual(
        parseSeedArgv(['--bootstrap']),
        { kind: 'ok', mode: 'bootstrap' },
    );
    assert.deepEqual(
        parseSeedArgv(['--mock-data']),
        { kind: 'ok', mode: 'mock-data' },
    );
});

test('parseSeedArgv help is kind help', () => {
    assert.deepEqual(
        parseSeedArgv(['--help']),
        { kind: 'help' },
    );
    assert.deepEqual(
        parseSeedArgv(['-h']),
        { kind: 'help' },
    );
});

test('parseSeedArgv none two unknown', () => {
    const none = parseSeedArgv([]);
    assert.equal(none.kind, 'error');
    if (none.kind !== 'error') return;
    assert.equal(
        none.message,
        SEED_EXCLUSIVE_FLAGS,
    );
    const two = parseSeedArgv([
        '--bootstrap', '--mock-data',
    ]);
    assert.equal(two.kind, 'error');
    if (two.kind !== 'error') return;
    assert.equal(
        two.message,
        SEED_EXCLUSIVE_FLAGS,
    );
    const unknown = parseSeedArgv(['--pristine']);
    assert.equal(unknown.kind, 'error');
    if (unknown.kind !== 'error') return;
    assert.match(unknown.message, /unknown/i);
});

test('seedErrorMessage never echoes a URL', () => {
    assert.equal(
        seedErrorMessage(new Error(
            'connect postgres://user:pw@h/db',
        )),
        'seed failed',
    );
    assert.equal(
        seedErrorMessage(new Error(SEED_NONEMPTY)),
        SEED_NONEMPTY,
    );
    assert.equal(
        seedErrorMessage(
            new Error(SEED_EXCLUSIVE_FLAGS),
        ),
        SEED_EXCLUSIVE_FLAGS,
    );
});

test('isDatabaseEmpty is true when no rows exist',
async () => {
    const empty = fakeClient([{
        message_pairs: false,
        marker: false,
    }]);
    assert.equal(await isDatabaseEmpty(empty.sql), true);
    assert.match(
        empty.texts[0] ?? '', /FROM message_pairs/,
    );
    assert.match(empty.texts[0] ?? '', /schema_marker/);
});

test('assertEmptyDatabase refuses any message row',
async () => {
    const nonempty = fakeClient([{
        message_pairs: true,
        marker: false,
    }]);
    await assert.rejects(
        () => assertEmptyDatabase(nonempty.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_NONEMPTY,
    );
});

test('assertEmptyDatabase refuses a marker row',
async () => {
    const marked = fakeClient([{
        message_pairs: false,
        marker: true,
    }]);
    await assert.rejects(
        () => assertEmptyDatabase(marked.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_NONEMPTY,
    );
});

test('postgres-seed refuses leftover pairs before DDL',
() => {
    const src = readFileSync(
        'server/postgres-seed.ts', 'utf8',
    );
    const legacy = src.indexOf(
        'assertNoLegacyMessageTables',
    );
    const ensure = src.indexOf('ensureTables');
    assert.ok(legacy >= 0);
    assert.ok(ensure >= 0);
    assert.ok(legacy < ensure);
});

test('serial hasher never overlaps', async () => {
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
    assert.equal(max, 1);
});

test('formatSeededCredentials is terminal text', () => {
    const text = formatSeededCredentials({
        identities: [{
            identityId: 'XXZruirZyAOoRpNxaDnpSA',
            username: 'demo@example.com',
            password: 'secret-once',
        }],
    });
    assert.ok(text.includes(SEED_REVEAL_HEADER));
    assert.match(text, /demo@example.com\tsecret-once/);
    assert.doesNotMatch(text, /"level":/);
});

test('non-empty refuses without seeding or printing',
async () => {
    const db = memoryDbAdapter();
    const nonempty = fakeClient([{
        message_pairs: true,
        marker: false,
    }]);
    let wrote = false;
    await assert.rejects(
        () => seedPostgres(
            nonempty.sql, db, 'bootstrap', {
                hashPassword: testHashPassword,
                write: () => {
                    wrote = true;
                },
            },
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_NONEMPTY,
    );
    assert.equal(wrote, false);
    assert.equal(await db.hasSchema(), false);
});

test('seedPostgres seeds when mode is required',
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
    assert.match(printed, /demo@example.com\t/);
    assert.ok(printed.includes(SEED_REVEAL_HEADER));
    assert.equal(await db.hasSchema(), true);
    assert.equal(chunks.length, 1);
});

test('bootstrap seed prints credentials once',
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
    assert.match(printed, /demo@example.com\t/);
    assert.ok(printed.includes(SEED_REVEAL_HEADER));
    assert.equal(await db.hasSchema(), true);
    assert.equal(chunks.length, 1);
});

test('mock-data seed prints every human sign-in',
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
    assert.equal(
        printed.split('\n').filter((line) =>
            line.includes('\t'),
        ).length,
        11,
    );
    assert.ok(printed.includes(SEED_REVEAL_HEADER));
    assert.equal(await db.hasSchema(), true);
});

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    test(
        'live seed skipped without POSTGRES_URL',
        { skip: 'POSTGRES_URL is unset' },
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

    before(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await adapter.ensureTables(TABLE_NAMES);
    });

    after(async () => {
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

    test('live empty bootstrap seeds then refuses',
    async () => {
        assert.equal(await isDatabaseEmpty(sql), true);
        const chunks: string[] = [];
        await seedPostgres(sql, adapter, 'bootstrap', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        });
        assert.equal(await hasSchemaMarker(sql), true);
        assert.equal(await isDatabaseEmpty(sql), false);
        assert.match(
            chunks.join(''),
            /demo@example.com\t/,
        );
        await assert.rejects(
            () => seedPostgres(
                sql, adapter, 'bootstrap', {
                    hashPassword: testHashPassword,
                    write: () => {},
                },
            ),
            (error: unknown) =>
                error instanceof Error
                && error.message === SEED_NONEMPTY,
        );
    });
}
