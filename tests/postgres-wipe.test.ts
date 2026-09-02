import { assertEquals, assertStrictEquals } from '@std/assert';
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

Deno.test('wipePostgres unsafes POSTGRES_DROP_SCHEMA',
async () => {
    const fake = fakeClient();
    await wipePostgres(fake.sql);
    assertEquals(fake.texts, [
        POSTGRES_DROP_SCHEMA,
    ]);
});

Deno.test('render wipe command names the operator tool',
() => {
    assertStrictEquals(
        renderWipeStartCommand(),
        './render-out/fusion-angle wipe',
    );
});
