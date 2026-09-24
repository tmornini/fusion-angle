import {
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { POOL_MAX } from '../api/advisory-lock.ts';
import { handleRequest } from '../api/api.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import type { DbAdapter } from '../api/db.ts';
import {
    attemptFor,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { nowUtc } from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { leafHashHex } from '../shared/pair-root.ts';
import { apiRequest } from './http-fixtures.ts';
import { organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Status overlay pins. Skip when POSTGRES_URL is
// unset so ./test validate stays Postgres-free.
// One scratch schema; do not share it.

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
    const name = base + '_message_plane';
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

function bytesFromHex(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(
            hex.slice(i * 2, i * 2 + 2), 16,
        );
    }
    return out;
}

function latin1(hex: string): string {
    return Octets.fromBytes(bytesFromHex(hex))
        .toLatin1();
}

function ideaDocument(
    title: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

function req(
    method: string,
    path: string,
    token: string,
    body: unknown,
): Request {
    return apiRequest({ method, path, token, body });
}

// ideas/:id has no DELETE route. The head is planted
// as a successor of the live PUT, not a second genesis.
async function plantDelete(
    db: DbAdapter,
    pathname: string,
): Promise<void> {
    const pathSegments = pathname
        .replace(/^\/+/, '')
        .split('/');
    const organization = pathSegments[1];
    if (
        pathSegments.length !== 4
        || organization === undefined
    ) {
        throw new Error('not an idea document path');
    }
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments,
        headerFields: [],
        body: undefined,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: nowUtc(),
        organization,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    );
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres message plane skipped without'
            + ' POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);
    const db = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTable();
        await seedAdminSchema(db);
        await Promise.all(Array.from(
            { length: POOL_MAX },
            () => sql.query`SELECT 1`,
        ));
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

    Deno.test(
        'a modifying PUT stores 200 and the hash'
            + ' covers that byte',
        async () => {
            const token = await organizationToken();
            const id = generateIdentifier();
            const path = '/organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
                + id;
            const created = await handleRequest(
                db, req(
                    'PUT', path, token,
                    ideaDocument('Fresh'),
                ),
            );
            const edited = await handleRequest(
                db, req(
                    'PUT', path, token,
                    ideaDocument('Edited'),
                ),
            );
            await plantDelete(db, path);
            const again = await handleRequest(
                db, req(
                    'PUT', path, token,
                    ideaDocument('Back'),
                ),
            );
            const rows = await sql.query<{
                method: string,
                response_hex: string,
                response_salt: string,
                response_hash: string,
            }>`
                SELECT method,
                    encode(response, 'hex')
                        AS response_hex,
                    encode(response_salt, 'hex')
                        AS response_salt,
                    encode(response_hash, 'hex')
                        AS response_hash
                FROM fa_message_pairs
                WHERE name = ${id}
                ORDER BY response_at ASC, id ASC
            `;
            assertStrictEquals(rows.length, 4);
            const expected = [
                ['PUT', 'HTTP/1.1 201 '],
                ['PUT', 'HTTP/1.1 200 '],
                ['DELETE', 'HTTP/1.1 204 '],
                ['PUT', 'HTTP/1.1 201 '],
            ] as const;
            for (let i = 0; i < expected.length; i++) {
                const row = rows[i]!;
                const want = expected[i]!;
                const text = latin1(row.response_hex);
                assertStrictEquals(row.method, want[0]);
                assertStrictEquals(
                    text.slice(0, 13), want[1],
                );
                assertEquals(
                    row.response_hash,
                    await leafHashHex(
                        bytesFromHex(row.response_salt),
                        bytesFromHex(row.response_hex),
                    ),
                );
            }
            assertStrictEquals(created.status, 201);
            assertStrictEquals(
                created.status,
                Number(latin1(
                    rows[0]!.response_hex,
                ).slice(9, 12)),
            );
            assertStrictEquals(edited.status, 200);
            assertStrictEquals(
                edited.status,
                Number(latin1(
                    rows[1]!.response_hex,
                ).slice(9, 12)),
            );
            assertStrictEquals(again.status, 201);
            assertStrictEquals(
                again.status,
                Number(latin1(
                    rows[3]!.response_hex,
                ).slice(9, 12)),
            );
        },
    );
}
