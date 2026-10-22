import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { RequestContext } from
    '../client/request-context.ts';
import { inPageContext } from './in-page-facade.ts';
import {
    claimToken,
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { apiRequest, partBodiesOf } from './http-fixtures.ts';
import { getMembers } from '../client/members-union.ts';
import { getHumanMembers } from '../client/members.ts';
import { getAIMembers } from '../client/ai-members.ts';
import { getIdentityRoster } from '../client/identities.ts';
import { getOrganizationSeats } from '../client/admin.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The member list is one organization's. The path fence
// refuses a foreign nest, the organization_id filter
// keeps the nest's own seats, and identities/ is the
// verified token's organization: each pinned here on two
// organizations, B holding a person, an AI, a service,
// and a pending invitation that A never sees.

const ORGANIZATION_A = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-06-01T00:00:00.000000Z';
const EXPIRES_AT = '2099-12-31T00:00:00.000000Z';
const FOREIGN_PATH =
    'forbidden: path organization does not match the'
    + ' token organization';

interface TwoOrganizations {
    db: MemoryDbAdapter;
    organizationB: string;
    bPerson: string;
    bAi: string;
    bService: string;
    bInvitee: string;
    aInvitee: string;
    bAdmin: string;
}

async function person(
    db: MemoryDbAdapter,
    email: string,
): Promise<string> {
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: email, email, phone: '', bio: '',
    });
    return id;
}

async function created(
    db: MemoryDbAdapter,
    path: string,
    token: string,
    body: unknown,
): Promise<void> {
    const response = await handleRequest(db, apiRequest({
        method: 'POST', path, token, body,
    }));
    assertStrictEquals(response.status, 201, path);
    await response.body?.cancel();
}

// A is the root admin's organization. B's admin seats an
// AI and a service through the statement and invites a
// person by email; A's admin invites another, so A's own
// pending list is non-empty.
async function twoOrganizations(): Promise<TwoOrganizations> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const organizationB = generateIdentifier();
    await seedOrganizationDocument(db, organizationB, 'Wayne');
    const bPerson = await person(db, 'bruce@wayne.com');
    await seedSeat(db, organizationB, bPerson, 'admin', AT);
    const bAdmin = await claimToken({
        sub: bPerson,
        organization: organizationB,
        organizations: [organizationB],
        roles: ['admin:' + organizationB],
    });
    const statement = '/organizations/' + organizationB
        + '/memberships/';
    const bAi = generateIdentifier();
    await created(db, statement, bAdmin, {
        id: bAi,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: {
            name: 'Alfred',
            description: 'Triage',
            skill_focus: 'routing',
            model: firstProviderModel().id,
        },
    });
    const bService = generateIdentifier();
    await created(db, statement, bAdmin, {
        id: bService,
        kind: 'service',
        membership: { type: 'member', at: AT },
        service: {
            name: 'Batcomputer',
            description: 'Loads the ledger export',
        },
    });
    const bInvitee = await person(db, 'lucius@wayne.com');
    await created(
        db, '/organizations/' + organizationB + '/invitations/',
        bAdmin,
        { email: 'lucius@wayne.com', at: AT,
            expiresAt: EXPIRES_AT },
    );
    const aInvitee = await person(db, 'pepper@stark.com');
    await created(
        db, '/organizations/' + ORGANIZATION_A + '/invitations/',
        await organizationToken(),
        { email: 'pepper@stark.com', at: AT,
            expiresAt: EXPIRES_AT },
    );
    return {
        db, organizationB, bPerson, bAi, bService,
        bInvitee, aInvitee, bAdmin,
    };
}

Deno.test('an A token reads no member list of B',
async () => {
    const fx = await twoOrganizations();
    for (const path of [
        '/organizations/' + fx.organizationB
            + '/memberships/?state=accepted',
        '/organizations/' + fx.organizationB + '/invitations/',
    ]) {
        const response = await handleRequest(fx.db, apiRequest({
            method: 'GET',
            path,
            token: await organizationToken(),
        }));
        assertStrictEquals(response.status, 403, path);
        assertEquals(
            await response.json(), { error: FOREIGN_PATH }, path,
        );
    }
});

Deno.test('an A admin\'s invitations list excludes B\'s'
    + ' pending invitation', async () => {
    const fx = await twoOrganizations();
    const foreign = await handleRequest(fx.db, apiRequest({
        method: 'GET',
        path: '/organizations/' + fx.organizationB
            + '/invitations/',
        token: fx.bAdmin,
    }));
    assertStrictEquals(foreign.status, 200);
    assertEquals(
        (await partBodiesOf<{ identity_id: string }>(foreign))
            .map((row) => row.identity_id),
        [fx.bInvitee],
    );
    const mine = await handleRequest(fx.db, apiRequest({
        method: 'GET',
        path: '/organizations/' + ORGANIZATION_A
            + '/invitations/',
        token: await organizationToken(),
    }));
    assertStrictEquals(mine.status, 200);
    assertEquals(
        (await partBodiesOf<{ identity_id: string }>(mine))
            .map((row) => row.identity_id),
        [fx.aInvitee],
    );
});

async function listedBy(
    ctx: RequestContext,
): Promise<Record<string, string[]>> {
    return {
        getMembers: (await getMembers(ctx))
            .map((member) => member.idForLink()),
        getHumanMembers: (await getHumanMembers(ctx))
            .map((member) => member.idForLink()),
        getAIMembers: (await getAIMembers(ctx))
            .map((member) => member.idForLink()),
        getIdentityRoster: (await getIdentityRoster(ctx))
            .map((row) => row.id),
        getOrganizationSeats: (await getOrganizationSeats(ctx))
            .map((seat) => seat.body().toValue().identity_id),
    };
}

Deno.test('an A-scoped context lists none of B\'s members',
async () => {
    const fx = await twoOrganizations();
    const bIds = [fx.bPerson, fx.bAi, fx.bService];
    const theirs = await listedBy(
        inPageContext(fx.db, fx.bAdmin),
    );
    assertEquals(
        bIds.filter((id) => !theirs['getMembers']!.includes(id)),
        [],
        'B lists its own members',
    );
    const ours = await listedBy(
        inPageContext(fx.db, await organizationToken()),
    );
    for (const [reader, ids] of Object.entries(ours)) {
        assertEquals(
            ids.filter((id) => bIds.includes(id)), [], reader,
        );
    }
});
