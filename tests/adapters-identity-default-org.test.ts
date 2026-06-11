import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    putIdentityDefaultOrg,
    getIdentityDefaultOrg,
} from '../web-app/app/adapters/identity-default-org.ts';

const AT = '2026-06-04T00:00:00.000000Z';

async function memberOf(orgs: string[]) {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    for (const [i, org] of orgs.entries()) {
        await db.memberships.put('m-' + i, {
            organization_id: org,
            identity_id: 'current',
            at: AT,
        });
    }
    return db;
}

test('putIdentityDefaultOrg sets the caller default org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await putIdentityDefaultOrg(ctx, '1');
    assert.equal(await getIdentityDefaultOrg(ctx), '1');
});

test('getIdentityDefaultOrg resolves the primary membership',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    assert.equal(await getIdentityDefaultOrg(ctx), '1');
});

test('putIdentityDefaultOrg rejects a non-member org',
async () => {
    const db = await memberOf(['1']);
    const ctx = createRequestContext(db, await devToken());
    await assert.rejects(
        () => putIdentityDefaultOrg(ctx, '2'));
});
