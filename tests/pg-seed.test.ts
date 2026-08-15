import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyDdl,
    boot,
    bootErrorMessage,
    hasSchemaMarker,
} from '../server/boot.ts';
import {
    applySeedFlag,
    assertEmptyDatabase,
    formatSeededCredentials,
    isDatabaseEmpty,
    readSeedMode,
    SEED_BOTH_FLAGS,
    SEED_BOOTSTRAP_FLAG,
    SEED_MOCK_DATA_FLAG,
    SEED_NONEMPTY,
    SEED_REVEAL_HEADER,
    serialPasswordHasher,
} from '../server/seed.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
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

test('readSeedMode accepts one flag', () => {
    assert.equal(
        readSeedMode(['node', SEED_BOOTSTRAP_FLAG]),
        'bootstrap',
    );
    assert.equal(
        readSeedMode(['node', SEED_MOCK_DATA_FLAG]),
        'mock-data',
    );
    assert.equal(readSeedMode(['node', 'boot.ts']), undefined);
});

test('readSeedMode refuses both flags', () => {
    assert.throws(
        () => readSeedMode([
            SEED_BOOTSTRAP_FLAG,
            SEED_MOCK_DATA_FLAG,
        ]),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_BOTH_FLAGS,
    );
});

test('boot refuses both seed flags before connect',
async () => {
    await assert.rejects(
        () => boot({}, [
            SEED_BOOTSTRAP_FLAG,
            SEED_MOCK_DATA_FLAG,
        ]),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_BOTH_FLAGS,
    );
    assert.equal(
        bootErrorMessage(new Error(SEED_BOTH_FLAGS)),
        SEED_BOTH_FLAGS,
    );
});

test('isDatabaseEmpty is true when no rows exist',
async () => {
    const empty = fakeClient([{
        requests: false,
        responses: false,
        marker: false,
    }]);
    assert.equal(await isDatabaseEmpty(empty.sql), true);
    assert.match(empty.texts[0] ?? '', /FROM requests/);
    assert.match(empty.texts[0] ?? '', /FROM responses/);
    assert.match(empty.texts[0] ?? '', /schema_marker/);
});

test('assertEmptyDatabase refuses any message row',
async () => {
    const nonempty = fakeClient([{
        requests: true,
        responses: false,
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
        requests: false,
        responses: false,
        marker: true,
    }]);
    await assert.rejects(
        () => assertEmptyDatabase(marked.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === SEED_NONEMPTY,
    );
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
            identityId: 'current',
            username: 'demo@example.com',
            password: 'secret-once',
        }],
    });
    assert.ok(text.includes(SEED_REVEAL_HEADER));
    assert.match(text, /demo@example.com\tsecret-once/);
    assert.doesNotMatch(text, /"level":/);
});

test('no seed flag writes nothing and seeds nothing',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        requests: false,
        responses: false,
        marker: false,
    }]);
    let wrote = false;
    await applySeedFlag(
        empty.sql, db, undefined, {
            hashPassword: testHashPassword,
            write: () => {
                wrote = true;
            },
        },
    );
    assert.equal(wrote, false);
    assert.equal(await db.hasSchema(), false);
    assert.equal(empty.texts.length, 0);
});

test('non-empty refuses without seeding or printing',
async () => {
    const db = memoryDbAdapter();
    const nonempty = fakeClient([{
        requests: true,
        responses: false,
        marker: false,
    }]);
    let wrote = false;
    await assert.rejects(
        () => applySeedFlag(
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

test('bootstrap seed prints credentials once',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        requests: false,
        responses: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await applySeedFlag(
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
        requests: false,
        responses: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await applySeedFlag(
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
        await applyDdl(sql);
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
        await applySeedFlag(sql, adapter, 'bootstrap', {
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
            () => applySeedFlag(
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
