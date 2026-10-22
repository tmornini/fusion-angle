import { assertEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import type { RequestContext } from
    '../client/request-context.ts';
import { adminContext } from './context-fixtures.ts';
import { seedServiceIdentity } from './identity-fixtures.ts';
import { getOrganizationSeats } from '../client/admin.ts';
import { getIdentityRoster } from '../client/identities.ts';
import { getHumanMembers } from '../client/members.ts';
import { getAIMembers } from '../client/ai-members.ts';
import { SYSTEM_MEMBER_ID } from '../shared/types.ts';

// The system identity authors the seed and holds no seat.
// Each roster reader is pinned on the seeded state — its
// document present (kind service, as mock-data writes it),
// no seat — so a reader that strayed from the seats to the
// identity heads would list it.
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
    assertEquals(
        (await getOrganizationSeats(ctx))
            .map((seat) => seat.body().toValue().identity_id)
            .filter((id) => id === SYSTEM_MEMBER_ID),
        [],
    );
});

Deno.test('getIdentityRoster lists no system identity',
async () => {
    const { ctx } = await setup();
    assertEquals(
        (await getIdentityRoster(ctx))
            .find((row) => row.id === SYSTEM_MEMBER_ID),
        undefined,
    );
});

Deno.test('getHumanMembers lists no system identity',
async () => {
    const { ctx } = await setup();
    assertEquals(
        (await getHumanMembers(ctx))
            .map((member) => member.idForLink())
            .filter((id) => id === SYSTEM_MEMBER_ID),
        [],
    );
});

Deno.test('getAIMembers lists no system identity',
async () => {
    const { ctx } = await setup();
    assertEquals(
        (await getAIMembers(ctx))
            .map((member) => member.idForLink())
            .filter((id) => id === SYSTEM_MEMBER_ID),
        [],
    );
});
