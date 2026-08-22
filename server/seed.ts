// Operator seed below HTTP. Flags seed an empty
// database and print credentials once. Non-empty
// refuses. formSeedMessagePair already mints operation_id.

import type { DbAdapter } from '../api/db.ts';
import {
    postBootstrap,
    postMockDataLoad,
    type SeededCredentials,
} from '../api/mock-data.ts';
import {
    postTestPlanSlices,
    sliceEntityId,
    type TestPlanSliceReveal,
} from '../api/test-plan-slices.ts';
import { buildMembers } from
    '../api/mock-data/members.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { hashPassword } from
    '../shared/password-hash.ts';
import {
    UTF8_REQUIRED,
    safeErrorMessage,
} from './postgres-gate.ts';

export const SEED_BOOTSTRAP_FLAG = '--bootstrap';
export const SEED_MOCK_DATA_FLAG = '--mock-data';
export const SEED_TEST_PLAN_SLICES_FLAG =
    '--test-plan-slices';
export const SEED_NONEMPTY =
    'database is not empty; refuse to seed';
export const SEED_EXCLUSIVE_FLAGS =
    'use exactly one of --bootstrap, '
    + '--mock-data, or '
    + '--test-plan-slices';
export const SEED_REVEAL_HEADER =
    'Save your demo sign-ins — shown once; copy them now.';
export const SEED_PASSWORD_HASH_CONCURRENCY = 1;

const SAFE_SEED_MESSAGES: ReadonlySet<string> = new Set([
    UTF8_REQUIRED,
    SEED_NONEMPTY,
    SEED_EXCLUSIVE_FLAGS,
]);

export function seedErrorMessage(
    error: unknown,
): string {
    return safeErrorMessage(
        error,
        SAFE_SEED_MESSAGES,
        'seed failed',
    );
}

export type SeedMode =
    | 'bootstrap'
    | 'mock-data'
    | 'test-plan-slices';

export type ParseSeedResult =
    | { kind: 'ok'; mode: SeedMode }
    | { kind: 'help' }
    | { kind: 'error'; message: string };

export type SeedPasswordHasher = (
    plaintext: string,
) => Promise<string>;

export type SeedRunOptions = {
    readonly hashPassword?: SeedPasswordHasher;
    readonly write: (chunk: string) => void;
};

export function parseSeedArgv(
    argv: readonly string[],
): ParseSeedResult {
    let mode: SeedMode | undefined;
    for (const a of argv) {
        if (a === '--help' || a === '-h') {
            return { kind: 'help' };
        }
        const next =
            a === SEED_BOOTSTRAP_FLAG ? 'bootstrap'
            : a === SEED_MOCK_DATA_FLAG ? 'mock-data'
            : a === SEED_TEST_PLAN_SLICES_FLAG
                ? 'test-plan-slices'
                : null;
        if (next === null) {
            return {
                kind: 'error',
                message: 'unknown argument: ' + a,
            };
        }
        if (mode !== undefined) {
            return {
                kind: 'error',
                message: SEED_EXCLUSIVE_FLAGS,
            };
        }
        mode = next;
    }
    if (mode === undefined) {
        return {
            kind: 'error',
            message: SEED_EXCLUSIVE_FLAGS,
        };
    }
    return { kind: 'ok', mode };
}

export async function isDatabaseEmpty(
    sql: SqlClient,
): Promise<boolean> {
    const rows = await sql.query<{
        message_pairs: boolean;
        marker: boolean;
    }>`
        SELECT
            EXISTS (
                SELECT 1 FROM message_pairs
            ) AS message_pairs,
            EXISTS (
                SELECT 1 FROM schema_marker
            ) AS marker
    `;
    const row = rows[0];
    if (row === undefined) return true;
    return !row.message_pairs && !row.marker;
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

const SLICE_REVEAL_FIELDS: ReadonlyArray<{
    readonly key: keyof TestPlanSliceReveal;
    readonly field: string;
}> = [
    { key: 'organizationId', field: 'org_id' },
    { key: 'organizationName', field: 'org_name' },
    { key: 'secondOrganizationId', field: 'org2_id' },
    { key: 'secondOrganizationName', field: 'org2_name' },
    { key: 'adminUsername',
        field: 'admin_username' },
    { key: 'adminPassword',
        field: 'admin_password' },
    { key: 'seatUsername',
        field: 'seat_username' },
    { key: 'seatPassword',
        field: 'seat_password' },
    { key: 'unseatedUsername',
        field: 'unseated_username' },
    { key: 'unseatedPassword',
        field: 'unseated_password' },
    { key: 'memberUsername',
        field: 'member_username' },
    { key: 'memberPassword',
        field: 'member_password' },
    { key: 'flowId', field: 'flow_id' },
];

export function formatTestPlanSliceCredentials(
    slices: readonly TestPlanSliceReveal[],
): string {
    const rows: string[] = [];
    for (const slice of slices) {
        for (const { key, field }
            of SLICE_REVEAL_FIELDS
        ) {
            const value = slice[key];
            if (value === undefined) continue;
            rows.push(
                slice.section
                + '\t' + field
                + '\t' + value,
            );
        }
    }
    return SEED_REVEAL_HEADER
        + '\n\n'
        + rows.join('\n');
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
    if (mode === 'test-plan-slices') {
        const slices = await postTestPlanSlices(
            adapter, { hashPassword: hash },
        );
        return {
            identities: slices.map((slice) => ({
                identityId: slice.section === 'AA'
                    ? buildMembers().find(
                        (m) => m.email
                            === 'demo@example.com',
                    )!.id
                    : sliceEntityId(
                        slice.section.toLowerCase()
                            + '-admin',
                    ),
                username: slice.adminUsername,
                password: slice.adminPassword,
            })),
        };
    }
    return postMockDataLoad(adapter, {
        hashPassword: hash,
    });
}

export async function seedPostgres(
    sql: SqlClient,
    adapter: DbAdapter,
    mode: SeedMode,
    options: SeedRunOptions,
): Promise<void> {
    await assertEmptyDatabase(sql);
    if (mode === 'test-plan-slices') {
        const slices = await postTestPlanSlices(
            adapter, options,
        );
        options.write(
            formatTestPlanSliceCredentials(slices)
            + '\n',
        );
        return;
    }
    const creds = await seedEmptyDatabase(
        adapter, mode, options,
    );
    writeSeededCredentials(creds, options.write);
}
