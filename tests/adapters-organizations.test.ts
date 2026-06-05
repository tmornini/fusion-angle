import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getOrganization,
    getOrganizations,
    putOrganization,
} from '../web-app/app/adapters/organizations.ts';

function orgRow(name: string) {
    return {
        name, domain: 'x.com',
        next_billing: '2026-01-01T00:00:00.000Z',
        seats: 10, used_seats: 1,
        projects_limit: 10, ideas_limit: 10,
        last_activity: '2026-01-01T00:00:00.000Z',
    };
}

async function ctxFor() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

test('putOrganization then getOrganization round-trips',
async () => {
    const { ctx } = await ctxFor();
    await putOrganization(ctx, '1', orgRow('Acme'));
    const org = await getOrganization(ctx, '1');
    assert.equal(org.name, 'Acme');
    assert.equal(org.id, '1');
});

test('getOrganizations returns only the caller member orgs',
async () => {
    const { db, ctx } = await ctxFor();
    await putOrganization(ctx, '1', orgRow('Acme'));
    await putOrganization(ctx, '7', orgRow('Beta'));
    await db.memberships.put('m', {
        organization_id: '1',
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000Z',
    });
    const orgs = await getOrganizations(ctx);
    assert.deepEqual(orgs.map(o => o.id), ['1']);
});
