import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { principalFromToken } from '../api/access-token.ts';
import {
    postOrganizationSessionExchange,
    shouldShowOrganizationSwitcher,
    resolveActiveOrganization,
} from '../web-app/app/adapters/organization-session.ts';

async function memberOf(organizations: string[]) {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    for (const [i, organization] of organizations.entries()) {
        await db.memberships.put('m-' + i, {
            organization_id: organization, identity_id: 'current',
            at: '2026-06-04T00:00:00.000000Z',
        });
    }
    return db;
}

test('exchanges a member token for an org-scoped token',
async () => {
    const db = await memberOf(['A']);
    const token = await devToken('current');
    const ctx = createRequestContext(db, token);
    const scoped = await postOrganizationSessionExchange(
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
        () => postOrganizationSessionExchange(ctx, token, 'B'));
});

test('shouldShowOrganizationSwitcher only at two or more orgs', () => {
    assert.equal(shouldShowOrganizationSwitcher([]), false);
    assert.equal(
        shouldShowOrganizationSwitcher([{ id: 'A' }]), false);
    assert.equal(
        shouldShowOrganizationSwitcher([{ id: 'A' }, { id: 'B' }]),
        true);
});

test('resolveActiveOrganization prefers a reachable persisted choice',
() => {
    assert.equal(
        resolveActiveOrganization(['1', '2'], '2', null), '2');
});

test('resolveActiveOrganization prefers a reachable identity default',
() => {
    assert.equal(
        resolveActiveOrganization(['1', '2'], null, '2'), '2');
});

test('resolveActiveOrganization falls back to the first reachable',
() => {
    assert.equal(
        resolveActiveOrganization(['1', '2'], null, null), '1');
    assert.equal(
        resolveActiveOrganization(['1', '2'], 'stale', '9'), '1');
});

test('resolveActiveOrganization returns a single membership directly',
() => {
    assert.equal(resolveActiveOrganization(['2'], null, null), '2');
    assert.equal(resolveActiveOrganization(['2'], '1', null), '2');
});
