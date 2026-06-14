import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    postMockDataLoad,
    postBootstrap,
} from '../api/mock-data.ts';
import { identityDefaultOrg } from '../api/authentication.ts';

async function mockSeeded() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    return db;
}

test('every membership-bearing person has a default-org event',
async () => {
    const db = await mockSeeded();
    const persons = (await db.identities.getAll())
        .filter(i => i.kind === 'person')
        .map(i => i.id);
    const memberships = await db.memberships.getAll();
    const haveDefault = new Set(
        (await db.identityDefaultOrganizations.getAll())
            .map(d => d.identity_id));
    for (const id of persons) {
        if (!memberships.some(m => m.identity_id === id)) {
            continue;
        }
        assert.ok(
            haveDefault.has(id),
            'person ' + id + ' lacks a default-org event');
    }
});

test("the seeded 'current' default resolves to org 1",
async () => {
    const db = await mockSeeded();
    assert.equal(
        await identityDefaultOrg(db, 'current'), '1');
});

test("bootstrap seeds 'current' a default-org event for org 1",
async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const defaults = await db.identityDefaultOrganizations.getAll();
    assert.ok(
        defaults.some(
            d => d.identity_id === 'current'
                && d.organization_id === '1'),
        "current has no default-org event for org 1");
});
