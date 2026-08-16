import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getOrganizations,
} from '../web-app/app/adapters/organizations.ts';
import {
    postOrganizationSessionExchange,
} from '../web-app/app/adapters/organization-session.ts';
import {
    devToken,
    reachableToken,
} from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';

// End-to-end of the boot-scope + org-switch flow the browser
// drives: enumerate reachable orgs, exchange a scoped token,
// and read org-fenced data — without the DOM. Proves switching
// re-scopes the roster and ideas, and that org '1' data is
// hidden from org '2'.

async function seeded(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

const idsOf = (rows: { id: string }[]): string[] =>
    [...rows.map(r => r.id)].sort();

test('boot enumerates both demo orgs for the admin',
async () => {
    const db = await seeded();
    // Claim orgs are the enumerate source (mint-time snapshot).
    // A multi-org admin token carries both demo orgs.
    const flat = await reachableToken('current', ['1', '2']);
    const ctx = createRequestContext(db, flat);
    const organizations = await getOrganizations(ctx);
    assert.deepEqual(
        [...organizations.map(o => o.id)].sort(), ['1', '2']);
});

test('switching the active org re-scopes members and ideas',
async () => {
    const db = await seeded();
    const flat = await reachableToken('current', ['1', '2']);
    const ctx = createRequestContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat, '1');
    const tokB = await postOrganizationSessionExchange(ctx, flat, '2');

    const membersA = idsOf(
        await GET<{ id: string }[]>(
            db, 'organizations/1/members', tokA));
    const membersB = idsOf(
        await GET<{ id: string }[]>(
            db, 'organizations/2/members', tokB));
    const ideasA = idsOf(
        await GET<{ id: string }[]>(db, 'ideas', tokA));
    const ideasB = idsOf(
        await GET<{ id: string }[]>(db, 'ideas', tokB));

    assert.ok(
        membersA.length > 0 && membersB.length > 0,
        'both orgs have members');
    assert.ok(
        ideasA.length > 0 && ideasB.length > 0,
        'both orgs have ideas');
    assert.notDeepEqual(
        membersA, membersB, 'roster re-scopes on switch');
    assert.notDeepEqual(
        ideasA, ideasB, 'ideas re-scope on switch');
    for (const id of ideasA) {
        assert.ok(
            !ideasB.includes(id),
            'org-1 ideas are fenced from org-2');
    }
});

test('a flat boot token resolves to the default org view',
async () => {
    const db = await seeded();
    const flat = await devToken('current');
    const flatIdeas = idsOf(
        await GET<{ id: string }[]>(db, 'ideas', flat));
    const ctx = createRequestContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat, '1');
    const organization1Ideas = idsOf(
        await GET<{ id: string }[]>(db, 'ideas', tokA));
    // a flat token resolves to its primary org '1' (same view)
    assert.deepEqual(flatIdeas, organization1Ideas);
});
