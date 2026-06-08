import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { mintAccessToken } from '../api/access-token.ts';
import { ideaBody, seedAdminSchema } from './test-fixtures.ts';

// A real signed token for `current` (admin, via seedRootAdmin)
// carrying an active `org` — what the facade exchange mints.
async function orgToken(org: string): Promise<string> {
    return mintAccessToken({
        sub: 'current', roles: [], name: 'Demo',
        iat: 1_700_000_000,
        ttlSeconds: 10_000_000_000,
        jti: 'org-scoped-test',
        ...(org ? { org } : {}),
    });
}

async function twoOrgIdeas(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);   // current = admin (global)
    await db.ideas.put('a1', ideaBody('1', 'mine'));
    await db.ideas.put('b1', ideaBody('7', 'theirs'));
    return db;
}

test('an org-scoped token fences GET to its tenant',
async () => {
    const db = await twoOrgIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'ideas', await orgToken('1'));
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a flat token bridges to the default org',
async () => {
    const db = await twoOrgIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'ideas', await orgToken(''));
    // No honest unscoped default since SP-6: the token
    // resolves to org '1', so the org '7' idea stays hidden.
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});
