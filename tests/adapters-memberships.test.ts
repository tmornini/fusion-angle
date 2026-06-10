import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    validateMembershipEntity,
} from '../api/validators.ts';

test('validates a membership body', () => {
    assert.deepEqual(
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
        }),
        {
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
        },
    );
});

test('rejects a membership with an extra key', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
            role: 'admin',
        }));
});

test('rejects a membership with a bad timestamp', () => {
    assert.throws(() =>
        validateMembershipEntity({
            organization_id: '1',
            identity_id: 'current',
            at: 'not-a-date',
        }));
});

test('memberships store round-trips a row', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.memberships.put('m1', {
        organization_id: '1',
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const row = await db.memberships.getById('m1');
    assert.equal(row.identity_id, 'current');
    assert.equal(row.organization_id, '1');
});

// The covenant is the enumerate source: a subject's reachable
// orgs are its membership rows, derived fresh — never cached.
test('a subject reaches its orgs via memberships', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.memberships.put('m1', {
        organization_id: '1', identity_id: 'alice',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.memberships.put('m2', {
        organization_id: '7', identity_id: 'alice',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.memberships.put('m3', {
        organization_id: '1', identity_id: 'bob',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const all = await db.memberships.getAll();
    const aliceOrgs = all
        .filter(m => m.identity_id === 'alice')
        .map(m => m.organization_id)
        .sort();
    assert.deepEqual(aliceOrgs, ['1', '7']);
});
