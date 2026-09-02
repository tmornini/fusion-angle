import { assert, assertEquals, assertNotEquals } from '@std/assert';
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
// re-scopes the roster and ideas, and that org 'AjdvjuECVZEgZoFajaIEkg' data
// is
// hidden from org 'BBjWJsjYIDkTRKIIPrzWRw'.

async function seeded(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

const idsOf = (rows: { id: string }[]): string[] =>
    [...rows.map(r => r.id)].sort();

Deno.test('boot enumerates both demo orgs for the admin',
async () => {
    const db = await seeded();
    // Claim orgs are the enumerate source (mint-time snapshot).
    // A multi-org admin token carries both demo orgs.
    const flat = await reachableToken('XXZruirZyAOoRpNxaDnpSA'
        , ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw']);
    const ctx = createRequestContext(db, flat);
    const organizations = await getOrganizations(ctx);
    assertEquals(
        [...organizations.map(o => o.id)].sort(), ['AjdvjuECVZEgZoFajaIEkg'
            , 'BBjWJsjYIDkTRKIIPrzWRw']);
});

Deno.test('switching the active org re-scopes members and ideas',
async () => {
    const db = await seeded();
    const flat = await reachableToken('XXZruirZyAOoRpNxaDnpSA'
        , ['AjdvjuECVZEgZoFajaIEkg', 'BBjWJsjYIDkTRKIIPrzWRw']);
    const ctx = createRequestContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat
        , 'AjdvjuECVZEgZoFajaIEkg');
    const tokB = await postOrganizationSessionExchange(ctx, flat
        , 'BBjWJsjYIDkTRKIIPrzWRw');

    const membersA = idsOf(
        await GET<{ id: string }[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', tokA));
    const membersB = idsOf(
        await GET<{ id: string }[]>(
            db, 'organizations/BBjWJsjYIDkTRKIIPrzWRw/members/', tokB));
    const ideasA = idsOf(
        await GET<{ id: string }[]>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', tokA));
    const ideasB = idsOf(
        await GET<{ id: string }[]>(db
            , 'organizations/BBjWJsjYIDkTRKIIPrzWRw/ideas/', tokB));

    assert(
        membersA.length > 0 && membersB.length > 0,
        'both orgs have members');
    assert(
        ideasA.length > 0 && ideasB.length > 0,
        'both orgs have ideas');
    assertNotEquals(
        membersA, membersB, 'roster re-scopes on switch');
    assertNotEquals(
        ideasA, ideasB, 'ideas re-scope on switch');
    for (const id of ideasA) {
        assert(
            !ideasB.includes(id),
            'org-1 ideas are fenced from org-2');
    }
});

Deno.test('a flat boot token resolves to the default org view',
async () => {
    const db = await seeded();
    const flat = await devToken('XXZruirZyAOoRpNxaDnpSA');
    const flatIdeas = idsOf(
        await GET<{ id: string }[]>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', flat));
    const ctx = createRequestContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat
        , 'AjdvjuECVZEgZoFajaIEkg');
    const organization1Ideas = idsOf(
        await GET<{ id: string }[]>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', tokA));
    // a flat token resolves to its primary org 'AjdvjuECVZEgZoFajaIEkg' (same
    // view)
    assertEquals(flatIdeas, organization1Ideas);
});
