import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { localStorageDbAdapter } from '../api/db-localstorage.ts';
import {
    TABLE_NAMES,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from '../api/db.ts';
import {
    SnapshotVersionMismatchError,
} from '../api/snapshot-validator.ts';

const KEY_PREFIX = 'fusion-ai:';

function installShim(): Map<string, string> {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(key: string): string | null;
            setItem(key: string, value: string): void;
            removeItem(key: string): void;
        };
    }).localStorage = {
        getItem(key) {
            return map.get(key) ?? null;
        },
        setItem(key, value) {
            map.set(key, value);
        },
        removeItem(key) {
            map.delete(key);
        },
    };
    return map;
}

// Every fixture below this line that expects putSnapshot to
// reach the TABLE_NAMES loop (i.e. every test past the raw-
// JSON-shape checks) must carry the reserved schema-version
// marker — parseAndValidateSnapshot rejects its absence before
// any table is read (Phase 12 Task 6). withVersion is the one
// place that truth lives for this file.
function withVersion(
    tables: Record<string, unknown>,
): Record<string, unknown> {
    return {
        [SNAPSHOT_SCHEMA_VERSION_KEY]: SNAPSHOT_SCHEMA_VERSION,
        ...tables,
    };
}

test(
    'rejects malformed JSON with not-valid-JSON message',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '{not valid',
            ),
            /not valid JSON/,
        );
    },
);

test(
    'rejects array root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '[]',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects null root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                'null',
            ),
            /object with table keys/,
        );
    },
);

test(
    'rejects scalar root with object-with-table-keys message',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await assert.rejects(
            () => adapter.putSnapshot(
                '"string"',
            ),
            /object with table keys/,
        );
    },
);

// The version gate sits between the object-shape check above
// and the TABLE_NAMES loop below (parseAndValidateSnapshot) —
// the UNIVERSAL guarantee: every DbAdapter.putSnapshot caller
// crosses it, not only the web-app file-upload path.
test(
    'rejects a snapshot missing the schema version marker',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify({ members: [] });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /schema version/i,
        );
    },
);

test(
    'rejects a snapshot with a mismatched schema version',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]:
                SNAPSHOT_SCHEMA_VERSION + 1,
            members: [],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /schema version/i,
        );
    },
);

test(
    'never defaults an absent version to the current one',
    async () => {
        // A non-numeric marker must reject exactly like an
        // absent one — no coercion, no best-effort accept.
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]: '1',
            members: [],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /schema version/i,
        );
    },
);

// Phase 13 Task 9's version bump (1→2, identity_tokens +
// authorization_codes retire): a genuine PRE-BUMP export — the
// literal historical version this build no longer accepts — is
// exactly what SNAPSHOT_SCHEMA_VERSION's ASYMMETRIC guarantee
// exists to reject (api/db.ts). Pinned as a concrete regression
// guard naming the real value, distinct from the generic
// mismatch legs above.
test(
    'rejects a genuine pre-Task-9 (v1) export with'
    + ' SnapshotVersionMismatchError',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        const json = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]: 1,
            members: [],
            identity_tokens: [],
            authorization_codes: [],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            (err: unknown) =>
                err instanceof SnapshotVersionMismatchError
                && err.found === 1,
        );
    },
);

// Phase Final Stage B Task 4's version bump (2→3): a genuine
// PRE-FINAL export — version 2 with REAL pre-Final table
// content (ideas + idea_submissions rows, not a bare version
// mismatch) — is rejected by SnapshotVersionMismatchError
// before any table key is read. Intra-phase mid-sequence v3
// exports are NOT a supported contract (api/db.ts).
test(
    'rejects a genuine pre-Final (v2) export with'
    + ' SnapshotVersionMismatchError',
    async () => {
        installShim();
        const adapter = localStorageDbAdapter();
        const json = JSON.stringify({
            [SNAPSHOT_SCHEMA_VERSION_KEY]: 2,
            members: [],
            ideas: [{
                id: 'i1',
                organization_id: '1',
                title: 'pre-Final idea',
                position: 1,
                problem_statement: 'p',
                target_users: 't',
                proposed_solution: 's',
                expected_outcome: 'o',
                success_metrics: 'm',
            }],
            idea_submissions: [{
                id: 'is1',
                idea_id: 'i1',
                member_id: 'system',
                at: '2020-01-01T00:00:00.000000Z',
            }],
        });
        await assert.rejects(
            () => adapter.putSnapshot(json),
            (err: unknown) =>
                err instanceof SnapshotVersionMismatchError
                && err.found === 2,
        );
    },
);

test(
    'accepts a snapshot carrying the current schema version',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [],
        }));
        await adapter.putSnapshot(json);
        const clients =
            await adapter.clients.getAll();
        assert.deepStrictEqual(clients, []);
    },
);

test(
    'rejects table value that is not an array',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: { not: 'an array' },
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /table "clients" is not an array/,
        );
    },
);

test(
    'rejects row that is not an object',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: ['not an object'],
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "clients" is not an object/,
        );
    },
);

test(
    'rejects null row',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [null],
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "clients" is not an object/,
        );
    },
);

test(
    'rejects array row',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [['not', 'an', 'object']],
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /row 0 in table "clients" is not an object/,
        );
    },
);

test(
    'rejects entity row with extra unknown key',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [
                {
                    id: 'u1',
                    grant_types: 'authorization_code',
                    redirect_uris:
                        'https://example.com/cb',
                    jwks: '{}',
                    aud: 'aud',
                    status: 'active',
                    rogue_field: 'invalid',
                },
            ],
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /snapshot\.clients\[0\]/,
        );
    },
);

test(
    'rejects client row with unknown key',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [{
                id: 'o1',
                grant_types: 'authorization_code',
                redirect_uris: 'https://example.com/cb',
                jwks: '{}',
                aud: 'aud',
                status: 'active',
                rogue_field: 'invalid',
            }],
        }));
        await assert.rejects(
            () => adapter.putSnapshot(json),
            /snapshot\.clients\[0\]/,
        );
    },
);

test(
    'accepts valid client row through the'
    + ' snapshot-validation gate',
    async () => {
        const map = installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [{
                id: 'o1',
                grant_types: 'authorization_code',
                redirect_uris: 'https://example.com/cb',
                jwks: '{}',
                aud: 'aud',
                status: 'active',
            }],
        }));
        await adapter.putSnapshot(json);
        assert.ok(
            map.get(KEY_PREFIX + 'clients'),
            'client row should persist',
        );
    },
);

test(
    'happy-path import populates target table',
    async () => {
        const map = installShim();
        const adapter =
            localStorageDbAdapter();
        const json = JSON.stringify(withVersion({
            clients: [
                {
                    id: 'u1',
                    grant_types: 'authorization_code',
                    redirect_uris: 'https://example.com/cb',
                    jwks: '{}',
                    aud: 'aud',
                    status: 'active',
                },
            ],
        }));
        await adapter.putSnapshot(json);
        const stored = map.get(
            KEY_PREFIX + 'clients',
        );
        assert.ok(stored, 'clients should persist');
    },
);

test(
    'putSnapshot materializes every known table as empty',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await adapter.putSnapshot(
            JSON.stringify(withVersion({})),
        );
        const reExported = JSON.parse(
            await adapter.getSnapshot(),
        );
        for (const table of TABLE_NAMES) {
            assert.deepStrictEqual(
                reExported[table],
                [],
                'table missing or non-empty: ' + table,
            );
        }
    },
);

test(
    'postSchemaCreation/hasSchema/deleteSchema lifecycle',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        assert.equal(
            await adapter.hasSchema(), false,
            'fresh storage has no schema',
        );
        await adapter.postSchemaCreation();
        assert.equal(
            await adapter.hasSchema(), true,
            'postSchemaCreation makes hasSchema true',
        );
        await adapter.deleteSchema();
        assert.equal(
            await adapter.hasSchema(), false,
            'deleteSchema returns to empty',
        );
    },
);

test(
    'postSchemaCreation is idempotent on re-run',
    async () => {
        const map = installShim();
        const adapter =
            localStorageDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.clients.put('u1', {
            grant_types: 'authorization_code',
            redirect_uris: 'https://example.com/cb',
            jwks: '{}',
            aud: 'aud',
            status: 'active',
        });
        await adapter.postSchemaCreation();
        const clients =
            await adapter.clients.getAll();
        assert.equal(
            clients.length, 1,
            'second postSchemaCreation preserves data',
        );
        assert.ok(
            map.get(KEY_PREFIX + 'clients'),
        );
    },
);

test(
    'getSnapshot includes every known table',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await adapter.postSchemaCreation();
        // Phase Final Stage B: roster retired — pin export
        // surface on clients.
        await adapter.clients.put('m1', {
            grant_types: 'authorization_code',
            redirect_uris: 'https://example.com/cb',
            jwks: '{}',
            aud: 'aud',
            status: 'active',
        });
        const json =
            await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.equal(parsed.clients.length, 1);
        for (const table of TABLE_NAMES) {
            assert.ok(
                Array.isArray(parsed[table]),
                'missing table in export: ' + table,
            );
        }
        assert.strictEqual(
            new Set(TABLE_NAMES).size,
            TABLE_NAMES.length,
            'TABLE_NAMES contains duplicates',
        );
        // TABLE_NAMES entries plus the ONE reserved schema-
        // version marker key (SNAPSHOT_SCHEMA_VERSION_KEY) —
        // never a second table, never a wrapper.
        assert.strictEqual(
            Object.keys(parsed).length,
            TABLE_NAMES.length + 1,
            'export key count !== TABLE_NAMES length + 1'
            + ' (the schema-version marker)',
        );
    },
);

test(
    'getSnapshot stamps the schema version marker',
    async () => {
        installShim();
        const adapter =
            localStorageDbAdapter();
        await adapter.postSchemaCreation();
        const json = await adapter.getSnapshot();
        const parsed = JSON.parse(json);
        assert.strictEqual(
            parsed[SNAPSHOT_SCHEMA_VERSION_KEY],
            SNAPSHOT_SCHEMA_VERSION,
        );
    },
);
