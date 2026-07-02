import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationRow } from './test-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizations,
    putOrganization,
} from '../web-app/app/adapters/organizations.ts';

test('putOrganization then getOrganization round-trips',
async () => {
    const { ctx } = await adminContext();
    await putOrganization(ctx, '1', organizationRow('Acme'));
    const organization = await getOrganization(ctx, '1');
    assert.equal(organization.name, 'Acme');
    assert.equal(organization.id, '1');
});

test('getOrganizations returns only the caller member orgs',
async () => {
    const { db, ctx } = await adminContext();
    await putOrganization(ctx, '1', organizationRow('Acme'));
    await putOrganization(ctx, '7', organizationRow('Beta'));
    await db.memberships.put('m', {
        organization_id: '1',
        identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    const organizations = await getOrganizations(ctx);
    assert.deepEqual(organizations.map(o => o.id), ['1']);
});
