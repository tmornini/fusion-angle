import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';

// Snapshot import is a second validation edge: the
// per-request write path is fenced at store
// construction, but importing a snapshot routes each
// row through validateSnapshotRow. Ten identity/auth
// tables silently no-op'd there — they imported
// unvalidated. These tests pin the closed gate:
// malformed identity/auth rows reject; valid rows pass.
// Mirrors snapshot-import-validation.test.ts.

function installShim(): void {
    const map = new Map<string, string>();
    (globalThis as unknown as {
        localStorage: {
            getItem(key: string): string | null;
            setItem(key: string, value: string): void;
            removeItem(key: string): void;
        };
    }).localStorage = {
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) { map.set(key, value); },
        removeItem(key) { map.delete(key); },
    };
}

async function rejectsImport(
    json: string, pattern: RegExp,
): Promise<void> {
    installShim();
    const adapter = new LocalStorageDbAdapter();
    await assert.rejects(
        () => adapter.putSnapshot(json),
        pattern,
    );
}

async function acceptsImport(json: string): Promise<void> {
    installShim();
    const adapter = new LocalStorageDbAdapter();
    await adapter.putSnapshot(json);
}

const AT = '2026-01-01T00:00:00.000000Z';

// One valid row per newly-gated table, exact body keys.
const VALID_ROWS: Record<
    string, Record<string, unknown>
> = {
    identities: { id: 'i1', kind: 'person' },
    identity_pii: {
        id: 'i1', name: 'Pat',
        email: 'pat@example.com',
        phone: '555-0100', bio: 'bio',
    },
    identity_credentials: {
        id: 'c1', identity_id: 'i1',
        kind: 'password', status: 'set',
        secret: 'hash', at: AT,
    },
    identity_token_revocations: {
        id: 'r1', identity_id: 'i1', at: AT,
    },
    identity_default_orgs: {
        id: 'd1', identity_id: 'i1',
        organization_id: '1', at: AT,
    },
    role_grants: {
        id: 'g1', organization_id: '1',
        identity_id: 'i1', role: 'admin',
        action: 'granted', by_member_id: 'm1', at: AT,
    },
    identity_tokens: {
        id: 't1', jti: 'jti-1', identity_id: 'i1',
        action: 'issued', chain_id: 'ch1',
        parent_jti: 'jti-0', at: AT,
    },
    clients: {
        id: 'cl1', grant_types: 'authorization_code',
        redirect_uris: 'https://example.com/cb',
        jwks: '{}', aud: 'aud', status: 'active',
    },
    identity_providers: {
        id: 'p1', identity_id: 'i1',
        provider: 'google', provider_subject: 'sub-1',
        action: 'linked', at: AT,
    },
    authorization_codes: {
        id: 'ac1', code: 'code-1', identity_id: 'i1',
        client_id: 'cl1', status: 'issued', at: AT,
    },
};

// One value-level malformation per table — the shape a
// real corrupt seed produces (bad enum / bad timestamp /
// unknown key), spread over the valid row.
const BAD_OVERRIDE: Record<
    string, Record<string, unknown>
> = {
    identities: { kind: 'robot' },
    identity_pii: { rogue_field: 'x' },
    identity_credentials: { status: 'pending' },
    identity_token_revocations: { at: 'not-a-date' },
    identity_default_orgs: { at: 'not-a-date' },
    role_grants: { action: 'maybe' },
    identity_tokens: { action: 'minted' },
    clients: { status: 'paused' },
    identity_providers: { action: 'connected' },
    authorization_codes: { status: 'expired' },
};

for (const [table, valid] of Object.entries(VALID_ROWS)) {
    const bad = BAD_OVERRIDE[table]!;
    test(
        'snapshot gate rejects malformed '
        + table + ' row',
        () => rejectsImport(
            JSON.stringify({
                [table]: [{ ...valid, ...bad }],
            }),
            new RegExp('snapshot\\.' + table + '\\[0\\]'),
        ),
    );
    test(
        'snapshot gate accepts valid ' + table + ' row',
        () => acceptsImport(
            JSON.stringify({ [table]: [valid] }),
        ),
    );
}
