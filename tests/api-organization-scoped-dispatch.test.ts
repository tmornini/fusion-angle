import './hmac-test-key.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET, PUT } from '../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';
import { ideaBody, seedAdminSchema } from './test-fixtures.ts';

// A real signed token for `current` (admin, via seedRootAdmin)
// carrying claim roles + organizations + an active `org` —
// what the facade exchange mints under claim-based fencing.
async function organizationToken(organization: string): Promise<string> {
    const org = organization || '1';
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'current',
        roles: ['admin:' + org],
        name: 'Demo',
        organizations: [org],
        iat: 1_700_000_000,
        ttlSeconds: 10_000_000_000,
        jti: 'org-scoped-test',
        ...(organization ? { organization } : {}),
    });
}

async function twoOrganizationIdeas(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);   // current = admin (global)
    // Seeded through the live document PUT so a1's message
    // pair exists — GET ideas derives from the ledger. No
    // foreign b1 seed: ideas table retired (Phase Final Stage
    // B); A-only visibility is proven by a1 alone.
    const { organization_id: _organizationId, ...a1Fields } =
        ideaBody('1', 'mine');
    await PUT(db, 'organizations/1/ideas/a1', {
        ...a1Fields,
        state: 'active',
    }, await organizationToken('1'));
    return db;
}

test('an org-scoped token fences GET to its tenant',
async () => {
    const db = await twoOrganizationIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'organizations/1/ideas/', await organizationToken('1'));
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a flat token bridges to the default org',
async () => {
    const db = await twoOrganizationIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'organizations/1/ideas/', await organizationToken(''));
    // No honest unscoped default since SP-6: the token
    // resolves to org '1', so the org '7' idea stays hidden.
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});
