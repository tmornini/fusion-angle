import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    postMockDataLoad,
    postBootstrap,
} from '../api/mock-data.ts';
import { identityDefaultOrganization } from '../api/authentication.ts';
import { deriveDefaultOrganization } from
    '../api/derive-default-organization.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { buildMembers } from '../api/mock-data/members.ts';

async function mockSeeded() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    return db;
}

// Phase Final Task 2: identity + membership + default-org
// ROW halves stripped — pair-plane oracles only.

test('every membership-bearing person has a default-org event',
async () => {
    const db = await mockSeeded();
    const persons = buildMembers().map(m => m.id);
    for (const id of persons) {
        const memberships =
            await deriveMembershipsForIdentity(db, id);
        if (memberships.length === 0) continue;
        const defaults = await deriveDefaultOrganization(
            db, id,
        );
        assert.ok(
            defaults.length > 0,
            'person ' + id + ' lacks a default-org event');
    }
});

test("the seeded 'current' default resolves to org 1",
async () => {
    const db = await mockSeeded();
    assert.equal(
        await identityDefaultOrganization(db, 'current'), '1');
});

test("bootstrap seeds 'current' a default-org event for org 1",
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const defaults = await deriveDefaultOrganization(
        db, 'current',
    );
    assert.ok(
        defaults.some(d => d.organization_id === '1'),
        "current has no default-org event for org 1");
    // Phase Final Stage B: identity spine tables retired.
});
