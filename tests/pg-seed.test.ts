import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    hasSchemaMarker,
} from '../server/boot.ts';
import {
    assertEmptyDatabase,
    formatSeededCredentials,
    formatTestPlanSliceCredentials,
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
import {
    PARALLEL_SECTIONS,
    postTestPlanSlices,
} from '../api/test-plan-slices.ts';
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
    assert.deepEqual(
        parseSeedArgv(['--test-plan-slices']),
        { kind: 'ok', mode: 'test-plan-slices' },
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
        pairs: false,
        marker: false,
    }]);
    assert.equal(await isDatabaseEmpty(empty.sql), true);
    assert.match(empty.texts[0] ?? '', /FROM pairs/);
    assert.match(empty.texts[0] ?? '', /schema_marker/);
});

test('assertEmptyDatabase refuses any message row',
async () => {
    const nonempty = fakeClient([{
        pairs: true,
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
        pairs: false,
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
            identityId: 'XXZruirZyAOoRpNxaDnpSA',
            username: 'demo@example.com',
            password: 'secret-once',
        }],
    });
    assert.ok(text.includes(SEED_REVEAL_HEADER));
    assert.match(text, /demo@example.com\tsecret-once/);
    assert.doesNotMatch(text, /"level":/);
});

test('formatTestPlanSliceCredentials is TSV',
() => {
    const text = formatTestPlanSliceCredentials([
        {
            section: 'AA',
            organizationId: 'AjdvjuECVZEgZoFajaIEkg',
            organizationName: 'Stark Industries',
            adminUsername: 'demo@example.com',
            adminPassword: 'secret-aa',
        },
        {
            section: 'B',
            organizationId: 'VdXgVFTbikqjizucMNlnPA',
            organizationName: 'Stark Industries',
            adminUsername:
                'b-admin@test-plan.example',
            adminPassword: 'secret-b',
            seatUsername:
                'b-member@test-plan.example',
            seatPassword: 'secret-b-seat',
            flowId: 'UXOPfjdZZohCcyCLlQWnuQ',
        },
        {
            section: 'G',
            organizationId: 'dsvIECNMaMqrLIswWbTVpg',
            organizationName: 'Stark Industries',
            secondOrganizationId: 'WlkfISpndVJfICRnWksipQ',
            secondOrganizationName: 'Wayne Enterprises',
            adminUsername:
                'g-admin@test-plan.example',
            adminPassword: 'secret-g',
            unseatedUsername:
                'g-unseated@test-plan.example',
            unseatedPassword: 'secret-g-u',
            memberUsername:
                'g-member@test-plan.example',
            memberPassword: 'secret-g-m',
        },
    ]);
    assert.ok(text.includes(SEED_REVEAL_HEADER));
    assert.match(
        text,
        /^AA\torg_id\tAjdvjuECVZEgZoFajaIEkg$/m,
    );
    assert.match(
        text,
        /^AA\tadmin_username\tdemo@example.com$/m,
    );
    assert.match(
        text,
        /^AA\tadmin_password\tsecret-aa$/m,
    );
    assert.match(
        text,
        /^B\tseat_username\tb-member@test-plan.example$/m,
    );
    assert.match(
        text,
        /^B\tflow_id\tUXOPfjdZZohCcyCLlQWnuQ$/m,
    );
    assert.match(
        text,
        /^G\torg2_id\tWlkfISpndVJfICRnWksipQ$/m,
    );
    assert.match(
        text,
        /^G\torg2_name\tWayne Enterprises$/m,
    );
    assert.doesNotMatch(text, /"level":/);
});

test('slice credential map omits absent extras',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const text = formatTestPlanSliceCredentials(
        reveal,
    );
    assert.ok(text.includes(SEED_REVEAL_HEADER));
    assert.doesNotMatch(text, /"level":/);
    for (const section of PARALLEL_SECTIONS) {
        assert.match(
            text,
            new RegExp(
                '^' + section + '\\t',
                'm',
            ),
            section,
        );
    }
    const extraPasswords = [
        'seat_password',
        'unseated_password',
        'member_password',
    ] as const;
    const omitExtras = [
        'AA', 'C', 'D', 'E', 'F', 'F2',
        'FS', 'H', 'I', 'K', 'R',
    ] as const;
    for (const section of omitExtras) {
        for (const field of extraPasswords) {
            assert.doesNotMatch(
                text,
                new RegExp(
                    '^'
                    + section
                    + '\\t'
                    + field
                    + '\\t',
                    'm',
                ),
                section + ' ' + field,
            );
        }
    }
    const bSeat = text.match(
        /^B\tseat_password\t(.+)$/m,
    );
    assert.ok(bSeat);
    assert.ok(
        (bSeat[1] ?? '').length >= 16,
    );
    const gUnseated = text.match(
        /^G\tunseated_password\t(.+)$/m,
    );
    assert.ok(gUnseated);
    assert.ok(
        (gUnseated[1] ?? '').length >= 16,
    );
    const gMember = text.match(
        /^G\tmember_password\t(.+)$/m,
    );
    assert.ok(gMember);
    assert.ok(
        (gMember[1] ?? '').length >= 16,
    );
    const svSeat = text.match(
        /^SV\tseat_password\t(.+)$/m,
    );
    assert.ok(svSeat);
    assert.ok(
        (svSeat[1] ?? '').length >= 16,
    );
});

test('non-empty refuses without seeding or printing',
async () => {
    const db = memoryDbAdapter();
    const nonempty = fakeClient([{
        pairs: true,
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
        pairs: false,
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
        pairs: false,
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
        pairs: false,
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

test('slices seed prints the section map',
async () => {
    const db = memoryDbAdapter();
    const empty = fakeClient([{
        pairs: false,
        marker: false,
    }]);
    const chunks: string[] = [];
    await seedPostgres(
        empty.sql, db, 'test-plan-slices', {
            hashPassword: testHashPassword,
            write: (chunk) => {
                chunks.push(chunk);
            },
        },
    );
    const printed = chunks.join('');
    assert.ok(
        printed.includes(SEED_REVEAL_HEADER),
    );
    assert.match(
        printed,
        /^AA\torg_id\tAjdvjuECVZEgZoFajaIEkg$/m,
    );
    assert.match(
        printed,
        /^SV\tadmin_username\tsv-admin@test-plan.example$/m,
    );
    assert.equal(await db.hasSchema(), true);
    assert.equal(chunks.length, 1);
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
