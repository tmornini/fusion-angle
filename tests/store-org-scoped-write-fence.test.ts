import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { orgScopedAdapter } from '../api/db-org-scoped.ts';
import { EntityNotFoundError } from '../api/db.ts';

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
    await db.postSchemaCreation();
    await db.ideas.put('b1', ideaBody('B'));
    const scopedA = orgScopedAdapter(db, 'A');
    await assert.rejects(
        () => scopedA.ideas.put('b1', ideaBody('A')),
        EntityNotFoundError);
    const after = await db.ideas.getById('b1');
    assert.equal(
        after.organization_id, 'B',
        'foreign row is neither clobbered nor re-stamped');
    assert.equal(after.title, 't');
});

test('an org-scoped putMany cannot overwrite a foreign row',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.ideas.put('b1', ideaBody('B'));
    const scopedA = orgScopedAdapter(db, 'A');
    await assert.rejects(
        () => scopedA.ideas.putMany(
            [{ id: 'b1', fields: ideaBody('A') }], []),
        EntityNotFoundError);
    const after = await db.ideas.getById('b1');
    assert.equal(after.organization_id, 'B');
});

test('an org-scoped put still creates a brand-new row',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.put('a1', ideaBody('ignored'));
    const stored = await db.ideas.getById('a1');
    assert.equal(stored.organization_id, 'A');
});

test('an org-scoped put updates a row it already owns',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.ideas.put('a1', ideaBody('A'));
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.put(
        'a1', { ...ideaBody('A'), title: 'updated' });
    const stored = await db.ideas.getById('a1');
    assert.equal(stored.title, 'updated');
    assert.equal(stored.organization_id, 'A');
});

test('a put cannot re-stamp a TOMBSTONED foreign-org row',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.ideas.put('b1', ideaBody('B'));
    // Tombstone it: lifecycle reads now say "absent", but
    // the row still exists — the fence must see the row,
    // not the lifecycle view.
    await db.states.postEvent(
        'ev1', 'b1', 'deleted', 'w1',
        '2026-01-01T00:00:00.000000Z',
    );
    const scopedA = orgScopedAdapter(db, 'A');
    await assert.rejects(
        () => scopedA.ideas.put('b1', ideaBody('A')),
        EntityNotFoundError);
    // The stored row keeps org B — read it raw via export
    // (lifecycle reads hide the tombstoned row).
    const snapshot = JSON.parse(
        await db.getSnapshot(),
    ) as { ideas: { id: string;
        organization_id: string }[] };
    const row = snapshot.ideas.find(r => r.id === 'b1');
    assert.equal(row?.organization_id, 'B');
});

test('a replayed DELETE is an idempotent no-op end to end',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.ideas.put('a1', ideaBody('A'));
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.delete('a1');
    await scopedA.ideas.delete('a1');
    await assert.rejects(
        () => db.ideas.getById('a1'),
        EntityNotFoundError);
});

test('a DELETE of a foreign-org id no-ops, splices nothing',
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.ideas.put('b1', ideaBody('B'));
    const scopedA = orgScopedAdapter(db, 'A');
    await scopedA.ideas.delete('b1');
    const after = await db.ideas.getById('b1');
    assert.equal(after.organization_id, 'B');
    assert.equal(after.title, 't');
});
