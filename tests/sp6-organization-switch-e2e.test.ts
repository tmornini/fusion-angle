import { assert, assertEquals, assertNotEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    inPageContext, GET, GETCollection,
} from './in-page-facade.ts';
import {
    getOrganizations,
} from '../client/organizations.ts';
import {
    postOrganizationSessionExchange,
} from '../client/organization-session.ts';
import {
    devToken,
    reachableToken,
} from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import { operationIdHeader } from './operation-id-header.ts';

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
    const ctx = inPageContext(db, flat);
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
    const ctx = inPageContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat
        , 'AjdvjuECVZEgZoFajaIEkg');
    const tokB = await postOrganizationSessionExchange(ctx, flat
        , 'BBjWJsjYIDkTRKIIPrzWRw');

    const membersA = idsOf(
        (await GET<{ id: string }[]>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', tokA,
                operationIdHeader())).body().toValue());
    const membersB = idsOf(
        (await GET<{ id: string }[]>(
            db, 'organizations/BBjWJsjYIDkTRKIIPrzWRw/members/', tokB,
                operationIdHeader())).body().toValue());
    const ideasA = idsOf(
        (await GETCollection<{ id: string }>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', tokA,
                operationIdHeader())).map((m) => m.body().toValue()));
    const ideasB = idsOf(
        (await GETCollection<{ id: string }>(db
            , 'organizations/BBjWJsjYIDkTRKIIPrzWRw/ideas/', tokB,
                operationIdHeader())).map((m) => m.body().toValue()));

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
        (await GETCollection<{ id: string }>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', flat,
                operationIdHeader())).map((m) => m.body().toValue()));
    const ctx = inPageContext(db, flat);
    const tokA = await postOrganizationSessionExchange(ctx, flat
        , 'AjdvjuECVZEgZoFajaIEkg');
    const organization1Ideas = idsOf(
        (await GETCollection<{ id: string }>(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', tokA,
                operationIdHeader())).map((m) => m.body().toValue()));
    // a flat token resolves to its primary org 'AjdvjuECVZEgZoFajaIEkg' (same
    // view)
    assertEquals(flatIdeas, organization1Ideas);
});
