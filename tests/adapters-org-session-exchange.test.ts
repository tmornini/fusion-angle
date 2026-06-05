import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { principalFromToken } from '../api/access-token.ts';
import {
    postOrgSessionExchange,
    shouldShowOrgSwitcher,
    resolveActiveOrg,
} from '../web-app/app/adapters/org-session.ts';

async function memberOf(orgs: string[]) {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    for (const [i, org] of orgs.entries()) {
        await db.memberships.put('m-' + i, {
            organization_id: org, identity_id: 'current',
            at: '2026-06-04T00:00:00.000Z',
        });
    }
    return db;
}

test('exchanges a member token for an org-scoped token',
async () => {
    const db = await memberOf(['A']);
    const token = await devToken('current');
    const ctx = createRequestContext(db, token);
    const scoped = await postOrgSessionExchange(
        ctx, token, 'A');
    const principal = principalFromToken(scoped);
    assert.equal(principal.organization, 'A');
    assert.equal(principal.id, 'current');
});

test('a non-member org exchange is rejected', async () => {
    const db = await memberOf(['A']);
    const token = await devToken('current');
    const ctx = createRequestContext(db, token);
    await assert.rejects(
        () => postOrgSessionExchange(ctx, token, 'B'));
});

test('shouldShowOrgSwitcher only at two or more orgs', () => {
    assert.equal(shouldShowOrgSwitcher([]), false);
    assert.equal(
        shouldShowOrgSwitcher([{ id: 'A' }]), false);
    assert.equal(
        shouldShowOrgSwitcher([{ id: 'A' }, { id: 'B' }]),
        true);
});

test('resolveActiveOrg prefers a reachable persisted choice',
() => {
    assert.equal(resolveActiveOrg(['1', '2'], '2'), '2');
});

test('resolveActiveOrg bridges to the default org', () => {
    assert.equal(resolveActiveOrg(['1', '2'], null), '1');
    assert.equal(resolveActiveOrg(['1', '2'], 'stale'), '1');
});

test('resolveActiveOrg returns a single membership directly',
() => {
    assert.equal(resolveActiveOrg(['2'], null), '2');
    assert.equal(resolveActiveOrg(['2'], '1'), '2');
});
