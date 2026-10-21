import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
import { handleRequest } from '../api/api.ts';
import { apiRequest } from './http-fixtures.ts';
import { devToken, organizationToken } from
    './token-fixtures.ts';
import {
    postAIMemberCreation,
    putAIMember,
    getAIMemberEntity,
    getAIMembers,
} from '../client/ai-members.ts';
import {
    seedHumanMember,
    seedAIMember,
    firstProviderModel,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { nowUtc } from '../shared/types.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';

function aiDraft(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

Deno.test(
    'postAIMemberCreation writes PUT organizations/:id/ai-agents/:id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = inPageContext(db, await devToken());
        const agentId = generateIdentifier();

        await postAIMemberCreation(
            ctx, agentId, aiDraft('Claude'),
        );

        const detail = (await getAIMemberEntity(ctx, agentId))
            .body().toValue();
        assertStrictEquals(detail.name, 'Claude');
        const agent = (await ctx.GET<{
            id: string; name: string;
        }>('organizations/AjdvjuECVZEgZoFajaIEkg/ai-agents/'
            + agentId)).body().toValue();
        assertStrictEquals(agent.name, 'Claude');
    },
);

Deno.test(
    'putAIMember updates the agent document',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const agentId = generateIdentifier();
        await seedAIMember(db, agentId, 'Claude');
        const ctx = inPageContext(db, await devToken());

        await putAIMember(
            ctx, await getAIMemberEntity(ctx, agentId),
            { ...aiDraft('Renamed'), skill_focus: 'qa' },
        );

        const detail = (await getAIMemberEntity(ctx, agentId))
            .body().toValue();
        assertStrictEquals(detail.name, 'Renamed');
        assertStrictEquals(detail.skill_focus, 'qa');
    },
);

Deno.test(
    'an AI member save latches its read and answers the'
    + ' new head',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const agentId = generateIdentifier();
        await seedAIMember(db, agentId, 'Claude');
        const { ctx, sent } = recordedContext(db, await devToken());
        const held = await getAIMemberEntity(ctx, agentId);
        sent.length = 0;
        const saved = await putAIMember(
            ctx, held, aiDraft('Renamed'),
        );
        assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
            ['PUT', held.query('header.etag').toText()],
        ]);
        assertStrictEquals(saved.body().toValue().name, 'Renamed');
    },
);

// The statement's answer names the membership head its
// removal latches.
async function postMember(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<string> {
    const response = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/memberships/',
        token: await organizationToken(),
        body,
    }));
    assertStrictEquals(response.status, 201);
    await response.body?.cancel();
    const etag = response.headers.get('ETag');
    assert(etag !== null);
    return etag;
}

Deno.test(
    'getAIMembers omits an AI whose membership is removed',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const agentId = generateIdentifier();
        const etag = await postMember(db, {
            id: agentId,
            kind: 'ai',
            membership: { type: 'member', at: nowUtc() },
            ai: aiDraft('Claude'),
        });
        const removed = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/organizations/' + STARK + '/invitations/'
                + membershipNameOf(STARK, agentId),
            token: await organizationToken(),
            body: { state: 'removed', at: nowUtc() },
            headers: { 'If-Match': etag },
        }));
        assertStrictEquals(removed.status, 200);
        await removed.body?.cancel();
        const ctx = inPageContext(db, await devToken());

        const members = await getAIMembers(ctx);

        assert(
            !members.some(m => m.idForLink() === agentId),
            'a removed AI is not an AI member',
        );
    },
);
