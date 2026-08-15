// Operator seed below HTTP. Flags seed an empty
// database and print credentials once. Non-empty
// refuses. formSeedPair already mints operation_id.

import type { DbAdapter } from '../api/db.ts';
import {
    postBootstrap,
    postMockDataLoad,
    type SeededCredentials,
} from '../api/mock-data.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { hashPassword } from
    '../shared/password-hash.ts';

export const SEED_BOOTSTRAP_FLAG = '--seed-bootstrap';
export const SEED_MOCK_DATA_FLAG = '--seed-mock-data';
export const SEED_NONEMPTY =
    'database is not empty; refuse to seed';
export const SEED_BOTH_FLAGS =
    'use only one of --seed-bootstrap or --seed-mock-data';
export const SEED_REVEAL_HEADER =
    'Save your demo sign-ins — shown once; copy them now.';
export const SEED_PASSWORD_HASH_CONCURRENCY = 1;

export type SeedMode = 'bootstrap' | 'mock-data';

export type SeedPasswordHasher = (
    plaintext: string,
) => Promise<string>;

export type SeedRunOptions = {
    readonly hashPassword?: SeedPasswordHasher;
    readonly write: (chunk: string) => void;
};

export function readSeedMode(
    argv: readonly string[],
): SeedMode | undefined {
    const bootstrap = argv.includes(SEED_BOOTSTRAP_FLAG);
    const mockData = argv.includes(SEED_MOCK_DATA_FLAG);
    if (bootstrap && mockData) {
        throw new Error(SEED_BOTH_FLAGS);
    }
    if (bootstrap) return 'bootstrap';
    if (mockData) return 'mock-data';
    return undefined;
}

export async function isDatabaseEmpty(
    sql: SqlClient,
): Promise<boolean> {
    const rows = await sql.query<{
        requests: boolean;
        responses: boolean;
        marker: boolean;
    }>`
        SELECT
            EXISTS (
                SELECT 1 FROM requests
            ) AS requests,
            EXISTS (
                SELECT 1 FROM responses
            ) AS responses,
            EXISTS (
                SELECT 1 FROM schema_marker
            ) AS marker
    `;
    const row = rows[0];
    if (row === undefined) return true;
    return !row.requests
        && !row.responses
        && !row.marker;
}

export async function assertEmptyDatabase(
    sql: SqlClient,
): Promise<void> {
    if (!(await isDatabaseEmpty(sql))) {
        throw new Error(SEED_NONEMPTY);
    }
}

export function serialPasswordHasher(
    hash: SeedPasswordHasher = hashPassword,
    concurrency: number = SEED_PASSWORD_HASH_CONCURRENCY,
): SeedPasswordHasher {
    let active = 0;
    const waiting: Array<() => void> = [];
    return async (plaintext: string) => {
        if (active >= concurrency) {
            await new Promise<void>((resolve) => {
                waiting.push(resolve);
            });
        }
        active += 1;
        try {
            return await hash(plaintext);
        } finally {
            active -= 1;
            const next = waiting.shift();
            if (next !== undefined) next();
        }
    };
}

export function formatSeededCredentials(
    creds: SeededCredentials,
): string {
    const lines = creds.identities.map(
        (identity) =>
            identity.username + '\t' + identity.password,
    );
    return SEED_REVEAL_HEADER + '\n\n' + lines.join('\n');
}

export function writeSeededCredentials(
    creds: SeededCredentials,
    write: (chunk: string) => void,
): void {
    write(formatSeededCredentials(creds) + '\n');
}

export async function seedEmptyDatabase(
    adapter: DbAdapter,
    mode: SeedMode,
    options?: { readonly hashPassword?: SeedPasswordHasher },
): Promise<SeededCredentials> {
    const hash = options?.hashPassword
        ?? serialPasswordHasher();
    if (mode === 'bootstrap') {
        return postBootstrap(adapter, {
            hashPassword: hash,
        });
    }
    return postMockDataLoad(adapter, {
        hashPassword: hash,
    });
}

export async function applySeedFlag(
    sql: SqlClient,
    adapter: DbAdapter,
    mode: SeedMode | undefined,
    options: SeedRunOptions,
): Promise<void> {
    if (mode === undefined) return;
    await assertEmptyDatabase(sql);
    const creds = await seedEmptyDatabase(
        adapter, mode, options,
    );
    writeSeededCredentials(creds, options.write);
}
