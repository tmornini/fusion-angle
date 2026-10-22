import { assert, assertEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import type { RequestContext } from
    '../client/request-context.ts';
import { adminContext } from './context-fixtures.ts';
import { seedServiceIdentity } from './identity-fixtures.ts';
import { seedAIMember } from './member-fixtures.ts';
import { getOrganizationSeats } from '../client/admin.ts';
import { getIdentityRoster } from '../client/identities.ts';
import { getHumanMembers } from '../client/members.ts';
import { getAIMembers } from '../client/ai-members.ts';
import { SYSTEM_MEMBER_ID } from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// The organization admin adminContext seats.
const ADMIN = 'XXZruirZyAOoRpNxaDnpSA';

// The system identity authors the seed and holds no seat.
// Each roster reader is pinned on the seeded state — its
// document present (kind service, as mock-data writes it),
// no seat — so a reader that strayed from the seats to the
// identity heads would list it. Each also lists a seated
// member, so a reader that lists nothing fails.
async function setup(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const { db, ctx } = await adminContext();
    await seedServiceIdentity(db, SYSTEM_MEMBER_ID);
    return { db, ctx };
}

Deno.test('getOrganizationSeats lists no system identity',
async () => {
    const { ctx } = await setup();
    const ids = (await getOrganizationSeats(ctx))
        .map((seat) => seat.body().toValue().identity_id);
    assert(ids.includes(ADMIN));
    assertEquals(ids.filter((id) => id === SYSTEM_MEMBER_ID), []);
});

Deno.test('getIdentityRoster lists no system identity',
async () => {
    const { ctx } = await setup();
    const ids = (await getIdentityRoster(ctx))
        .map((row) => row.id);
    assert(ids.includes(ADMIN));
    assertEquals(ids.filter((id) => id === SYSTEM_MEMBER_ID), []);
});

Deno.test('getHumanMembers lists no system identity',
async () => {
    const { ctx } = await setup();
    const ids = (await getHumanMembers(ctx))
        .map((member) => member.idForLink());
    assert(ids.includes(ADMIN));
    assertEquals(ids.filter((id) => id === SYSTEM_MEMBER_ID), []);
});

// The organization admin is a person, never an AI member;
// an AI seated through the statement is the positive.
Deno.test('getAIMembers lists no system identity',
async () => {
    const { db, ctx } = await setup();
    const agent = generateIdentifier();
    await seedAIMember(db, agent, 'Claude');
    const ids = (await getAIMembers(ctx))
        .map((member) => member.idForLink());
    assert(ids.includes(agent));
    assertEquals(ids.filter((id) => id === SYSTEM_MEMBER_ID), []);
});
