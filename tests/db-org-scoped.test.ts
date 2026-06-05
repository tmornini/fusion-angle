import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { orgScopedAdapter } from '../api/db-org-scoped.ts';
import { OrgScopedEntityStore }
    from '../api/store-org-scoped.ts';

function ideaBody(org: string, title: string) {
    return {
        organization_id: org, title,
        position: 0, problem_statement: '',
        target_users: '', proposed_solution: '',
        expected_outcome: '', success_metrics: '',
    };
}

async function seeded() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.ideas.put('a1', ideaBody('A', 'mine'));
    await db.ideas.put('b1', ideaBody('B', 'theirs'));
    return db;
}

test('global stores pass through unwrapped', async () => {
    const db = await seeded();
    const scoped = orgScopedAdapter(db, 'A');
    assert.equal(scoped.identities, db.identities);
    assert.equal(scoped.members, db.members);
    assert.equal(scoped.organizations, db.organizations);
    assert.equal(scoped.states, db.states);
});

test('org-owned stores are wrapped by the guard', async () => {
    const db = await seeded();
    const scoped = orgScopedAdapter(db, 'A');
    assert.ok(scoped.ideas instanceof OrgScopedEntityStore);
    assert.ok(
        scoped.memberships instanceof OrgScopedEntityStore,
    );
    assert.ok(
        scoped.roleGrants instanceof OrgScopedEntityStore,
    );
});

test('a scoped getAll returns only the bound org', async () => {
    const db = await seeded();
    const scoped = orgScopedAdapter(db, 'A');
    const rows = await scoped.ideas.getAll();
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a scoped getById 404s a foreign-org row', async () => {
    const db = await seeded();
    const scoped = orgScopedAdapter(db, 'A');
    await assert.rejects(() => scoped.ideas.getById('b1'));
});

test('a scoped put stamps the bound org', async () => {
    const db = await seeded();
    const scoped = orgScopedAdapter(db, 'A');
    await scoped.ideas.put('a2', ideaBody('B', 'forged'));
    const row = await db.ideas.getById('a2');
    assert.equal(row.organization_id, 'A');
});
