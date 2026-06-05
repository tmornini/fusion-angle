import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
import {
    currentRolesForInOrg,
} from '../api/authorization.ts';
import { verifyPassword } from '../api/password-hash.ts';

const ORG_ONE = '1';
const ORG_TWO = '2';

async function seed() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const creds = await populateMockData(db);
    return { db, creds };
}

test('current is a member of exactly orgs 1 and 2',
async () => {
    const { db } = await seed();
    const orgs = (await db.memberships.getAll())
        .filter(m => m.identity_id === 'current')
        .map(m => m.organization_id)
        .sort();
    assert.deepEqual(orgs, ['1', '2']);
});

test('current holds admin in both orgs', async () => {
    const { db } = await seed();
    const grants = await db.roleGrants.getAll();
    assert.ok(
        currentRolesForInOrg(grants, 'current', ORG_ONE)
            .includes('admin'));
    assert.ok(
        currentRolesForInOrg(grants, 'current', ORG_TWO)
            .includes('admin'));
});

test('both organizations exist with distinct names',
async () => {
    const { db } = await seed();
    const orgs = await db.organizations.getAll();
    const one = orgs.find(o => o.id === ORG_ONE);
    const two = orgs.find(o => o.id === ORG_TWO);
    assert.ok(one, 'org 1 exists');
    assert.ok(two, 'org 2 exists');
    assert.notEqual(one.name, two.name);
});

test('each org owns at least one of every org-scoped'
    + ' entity', async () => {
    const { db } = await seed();
    const tables = {
        ideas: await db.ideas.getAll(),
        projects: await db.projects.getAll(),
        flows: await db.flows.getAll(),
        records: await db.records.getAll(),
        objectives: await db.objectives.getAll(),
    };
    for (const org of [ORG_ONE, ORG_TWO]) {
        for (const [name, rows] of Object.entries(tables)) {
            const owned = rows.filter(
                r => r.organization_id === org);
            assert.ok(
                owned.length >= 1,
                `org ${org} owns no ${name}`);
        }
    }
});

test('every work order belongs to org 1', async () => {
    const { db } = await seed();
    const wos = await db.workOrders.getAll();
    assert.ok(wos.length > 0, 'work orders exist');
    for (const wo of wos) {
        assert.equal(wo.organization_id, ORG_ONE);
    }
});

test('every record attribute matches its parent record org',
async () => {
    const { db } = await seed();
    const recordOrg = new Map(
        (await db.records.getAll())
            .map(r => [r.id, r.organization_id]));
    for (const attr of await db.recordAttributes.getAll()) {
        assert.equal(
            attr.organization_id,
            recordOrg.get(attr.record_id),
            `attribute ${attr.id} org mismatch`);
    }
});

test('every non-admin seeded human is single-org',
async () => {
    const { db } = await seed();
    const byIdentity = new Map<string, Set<string>>();
    for (const m of await db.memberships.getAll()) {
        const set = byIdentity.get(m.identity_id)
            ?? new Set<string>();
        set.add(m.organization_id);
        byIdentity.set(m.identity_id, set);
    }
    const persons = (await db.identities.getAll())
        .filter(i => i.kind === 'person')
        .map(i => i.id);
    for (const id of persons) {
        if (id === 'current') continue;
        const orgs = byIdentity.get(id) ?? new Set();
        assert.ok(
            orgs.size <= 1,
            `non-admin ${id} spans multiple orgs`);
    }
});

test('every flow_records row joins same-org flow and'
    + ' record', async () => {
    const { db } = await seed();
    const flowOrg = new Map(
        (await db.flows.getAll())
            .map(f => [f.id, f.organization_id]));
    const recordOrg = new Map(
        (await db.records.getAll())
            .map(r => [r.id, r.organization_id]));
    const bindings = await db.flowRecords.getAll();
    assert.ok(bindings.length > 0, 'bindings exist');
    for (const b of bindings) {
        assert.equal(
            flowOrg.get(b.flow_id),
            recordOrg.get(b.record_id),
            `binding ${b.id} crosses orgs`);
    }
});

test('every seeded human gets a verifiable password',
async () => {
    const { db, creds } = await seed();
    assert.ok(
        creds.identities.length >= 2,
        'multiple humans seeded');
    const credRows = await db.identityCredentials.getAll();
    for (const c of creds.identities) {
        const row = credRows.find(
            r => r.identity_id === c.identityId
                && r.kind === 'password');
        assert.ok(row, `no password row for ${c.identityId}`);
        assert.equal(
            await verifyPassword(c.password, row.secret),
            true);
        assert.match(c.username, /@/);
    }
});
