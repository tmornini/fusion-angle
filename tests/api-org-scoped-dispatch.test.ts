import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { mintAccessToken } from '../api/access-token.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import { DEFAULT_ORG } from '../api/types.ts';

function ideaBody(org: string, title: string) {
    return {
        organization_id: org, title,
        position: 0, problem_statement: '',
        target_users: '', proposed_solution: '',
        expected_outcome: '', success_metrics: '',
    };
}

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
    await db.createSchema();
    await seedRootAdmin(db);   // current = admin (global)
    await db.ideas.put('a1', ideaBody(DEFAULT_ORG, 'mine'));
    await db.ideas.put('b1', ideaBody('7', 'theirs'));
    return db;
}

test('an org-scoped token fences GET to its tenant',
async () => {
    const db = await twoOrgIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'ideas', await orgToken(DEFAULT_ORG));
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a flat token sees every tenant (decorator inert)',
async () => {
    const db = await twoOrgIdeas();
    const rows = await GET<{ id: string }[]>(
        db, 'ideas', await orgToken(''));
    assert.equal(rows.length, 2);
});
