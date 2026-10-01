import { assertEquals, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { organizationRow } from './test-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizations,
    putOrganization,
} from '../client/organizations.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    compareIdentifiers,
    generateIdentifier,
} from '../shared/identifier.ts';

Deno.test('putOrganization then getOrganization round-trips',
async () => {
    const { ctx } = await adminContext();
    await putOrganization(
        ctx, await getOrganization(ctx, 'AjdvjuECVZEgZoFajaIEkg'),
        organizationRow('Acme'),
    );
    const organization = (
        await getOrganization(ctx, 'AjdvjuECVZEgZoFajaIEkg')
    ).body().toValue();
    assertStrictEquals(organization.name, 'Acme');
    assertStrictEquals(organization.id, 'AjdvjuECVZEgZoFajaIEkg');
});

// Below-facade pair formation (the member-fixtures.ts idiom):
// getOrganizations' own membership filter derives from the pair
// plane once memberships flips, so a raw row here would go
// derivation-invisible. Every id/field value stays IDENTICAL to
// the raw put this replaces — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    organization: string,
    identityId: string,
    at: string,
): Promise<void> {
    await seedSeat(
        db,
        organization,
        identityId,
        identityId === 'XXZruirZyAOoRpNxaDnpSA' ? 'admin' : 'member',
        at,
    );
}

Deno.test('getOrganizations returns only the caller member orgs',
async () => {
    const { db, ctx } = await adminContext();
    await putOrganization(
        ctx, await getOrganization(ctx, 'AjdvjuECVZEgZoFajaIEkg'),
        organizationRow('Acme'),
    );
    await ctx.PUT(
        'organizations/' + generateIdentifier(),
        organizationRow('Beta'),
    );
    await seedMembershipPair(
        db, generateIdentifier(),
        'AjdvjuECVZEgZoFajaIEkg', 'XXZruirZyAOoRpNxaDnpSA',
        '2026-06-04T00:00:00.000000Z',
    );
    const organizations = await getOrganizations(ctx);
    assertEquals(organizations.map(o => o.body().toValue().id)
        , ['AjdvjuECVZEgZoFajaIEkg']);
});

Deno.test('getOrganizations lists the seats by id, not by write',
async () => {
    const { db, ctx } = await adminContext();
    const [low, high] = [generateIdentifier(), generateIdentifier()]
        .sort(compareIdentifiers) as [string, string];
    for (const id of [high, low]) {
        await ctx.PUT(
            'organizations/' + id, organizationRow('O-' + id),
        );
        await seedMembershipPair(
            db, generateIdentifier(), id, 'XXZruirZyAOoRpNxaDnpSA',
            '2026-06-04T00:00:00.000000Z',
        );
    }
    assertEquals(
        (await getOrganizations(ctx))
            .map(o => o.body().toValue().id)
            .filter(id => id === low || id === high),
        [low, high],
    );
});
