import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    putIdentityDefaultOrganization,
    getIdentityDefaultOrganization,
} from '../web-app/app/adapters/identity-default-organization.ts';

const AT = '2026-06-04T00:00:00.000000Z';

async function memberOf(organizations: string[]) {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    for (const [i, organization] of organizations.entries()) {
        await db.memberships.put('m-' + i, {
            organization_id: organization,
            identity_id: 'current',
            at: AT,
        });
    }
    return db;
}

test('putIdentityDefaultOrganization sets the caller default org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await putIdentityDefaultOrganization(ctx, '1');
    assert.equal(await getIdentityDefaultOrganization(ctx), '1');
});

test('getIdentityDefaultOrganization resolves the primary membership',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    assert.equal(await getIdentityDefaultOrganization(ctx), '1');
});

test('putIdentityDefaultOrganization rejects a non-member org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await assert.rejects(
        () => putIdentityDefaultOrganization(ctx, '2'));
});
