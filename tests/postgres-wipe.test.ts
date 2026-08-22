import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSTGRES_DROP_SCHEMA } from
    '../api/backend-postgres.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import {
    renderWipeStartCommand,
    wipePostgres,
} from '../server/postgres-wipe.ts';

function fakeClient(): {
    readonly sql: SqlClient;
    readonly texts: string[];
} {
    const texts: string[] = [];
    const sql: SqlClient = {
        query: <T>(
            _strings: TemplateStringsArray,
            ..._values: unknown[]
        ) => Promise.resolve([] as T[]),
        begin: async (fn) => fn(sql),
        unsafe: async <T>(query: string) => {
            texts.push(query);
            return [] as T[];
        },
        end: async () => {},
    };
    return { sql, texts };
}

test('wipePostgres unsafes POSTGRES_DROP_SCHEMA',
async () => {
    const fake = fakeClient();
    await wipePostgres(fake.sql);
    assert.deepEqual(fake.texts, [
        POSTGRES_DROP_SCHEMA,
    ]);
});

test('render wipe command embeds the drop list',
() => {
    const command = renderWipeStartCommand();
    const prefix = 'node --input-type=module -e ';
    assert.equal(command.startsWith(prefix), true);
    assert.equal(command.includes('\n'), false);
    const script = JSON.parse(
        command.slice(prefix.length),
    );
    assert.equal(typeof script, 'string');
    assert.equal(
        script.includes(
            JSON.stringify(POSTGRES_DROP_SCHEMA),
        ),
        true,
    );
    assert.equal(
        script.includes('DROP TABLE IF EXISTS pairs'),
        true,
    );
});
