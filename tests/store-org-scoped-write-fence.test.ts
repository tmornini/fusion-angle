import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { orgScopedAdapter } from '../api/db-org-scoped.ts';
import { EntityNotFound } from '../api/db.ts';

// The org guard must fence WRITES the same way it fences reads:
// a put/putMany targeting an id owned by another tenant must
// 404 (no clobber, no re-stamp), while a brand-new id still
// creates and an owned id still updates.

function ideaBody(org: string) {
    return {
        organization_id: org, title: 't', position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
    };
}

test('an org-scoped put cannot overwrite a foreign-org row',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.ideas.put('b1', ideaBody('B'));
    const scopedA = orgScopedAdapter(db, 'A');
    await assert.rejects(
        () => scopedA.ideas.put('b1', ideaBody('A')),
        EntityNotFound);
    const after = await db.ideas.getById('b1');
    assert.equal(
        after.organization_id, 'B',
        'foreign row is neither clobbered nor re-stamped');
    assert.equal(after.title, 't');
});

test('an org-scoped putMany cannot overwrite a foreign row',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.ideas.put('b1', ideaBody('B'));
    const scopedA = orgScopedAdapter(db, 'A');
    await assert.rejects(
        () => scopedA.ideas.putMany(
            [{ id: 'b1', fields: ideaBody('A') }], []),
        EntityNotFound);
    const after = await db.ideas.getById('b1');
    assert.equal(after.organization_id, 'B');
});

test('an org-scoped put still creates a brand-new row',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.put('a1', ideaBody('ignored'));
    const stored = await db.ideas.getById('a1');
    assert.equal(stored.organization_id, 'A');
});

test('an org-scoped put updates a row it already owns',
async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.ideas.put('a1', ideaBody('A'));
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.put(
        'a1', { ...ideaBody('A'), title: 'updated' });
    const stored = await db.ideas.getById('a1');
    assert.equal(stored.title, 'updated');
    assert.equal(stored.organization_id, 'A');
});
