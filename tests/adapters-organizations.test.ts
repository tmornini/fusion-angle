import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationRow,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizations,
    putOrganization,
    queryOrganization,
} from '../client/organizations.ts';
import type { RequestContext } from '../client/request-context.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { apiRequest } from './http-fixtures.ts';
import { membershipNameOf } from '../shared/membership-name.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
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
    await seedOrganizationDocument(db, generateIdentifier(), 'Beta');
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
        await seedOrganizationDocument(db, id, 'O-' + id);
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

const ROOT = '/organizations/AjdvjuECVZEgZoFajaIEkg';

async function put(
    db: MemoryDbAdapter,
    path: string,
    body: Record<string, unknown>,
): Promise<void> {
    const res = await handleRequest(db, apiRequest({
        method: 'PUT', path, token: await organizationToken(), body,
    }));
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
}

async function idea(
    db: MemoryDbAdapter,
    title: string,
): Promise<string> {
    const id = generateIdentifier();
    await put(db, ROOT + '/ideas/' + id, {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    });
    return id;
}

Deno.test('queryOrganization sorts parts into the three lists'
+ ' in answer order', async () => {
    const { db, ctx } = await adminContext();
    const member = generateIdentifier();
    await seedHumanMember(db, member, 'Kestrel Moss');
    const project = generateIdentifier();
    await put(db, ROOT + '/projects/' + project, {
        title: 'Kestrel rollout',
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
        state: 'submitted',
    });
    const typo = await idea(db, 'Kestral plan');
    const exact = await idea(db, 'Kestrel plan');
    const found = await queryOrganization(ctx, 'kestrel');
    assertEquals(
        found.ideas.map((part) => part.body().toValue().id),
        [exact, typo],
    );
    assertEquals(
        found.projects.map((part) => part.body().toValue().id),
        [project],
    );
    assertEquals(
        found.members.map((part) => part.body().toValue().id),
        [membershipNameOf('AjdvjuECVZEgZoFajaIEkg', member)],
    );
});

// A part the client cannot sort is a server it does not
// know, so it fails the search rather than hide the part.
Deno.test('queryOrganization refuses a part of an unknown family',
async () => {
    const part = HttpMessage.fromWire(
        'HTTP/1.1 200 OK\r\n'
            + 'content-location: ' + ROOT + '/flows/x\r\n'
            + 'content-type: application/json\r\n'
            + 'content-length: 10\r\n\r\n{"id":"x"}',
    );
    const ctx = {
        identity: { organization: 'AjdvjuECVZEgZoFajaIEkg' },
        QUERY: () => Promise.resolve([part]),
    } as unknown as RequestContext;
    await assertRejects(
        () => queryOrganization(ctx, 'x'),
        Error,
        'flows',
    );
});
