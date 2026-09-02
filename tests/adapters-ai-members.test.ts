import { assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postAIMemberCreation,
    putAIMember,
    getAIMemberEntity,
} from '../web-app/app/adapters/ai-members.ts';
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

function aiDraft(name: string) {
    return {
        name,
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

Deno.test(
    'postAIMemberCreation writes PUT /ai-agents/:id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
        const ctx = createRequestContext(db, await devToken());
        const agentId = generateIdentifier();

        await postAIMemberCreation(
            ctx, agentId, aiDraft('Claude'),
        );

        const detail = await getAIMemberEntity(ctx, agentId);
        assertStrictEquals(detail.name, 'Claude');
        const agent = await ctx.GET<{
            id: string; name: string;
        }>('ai-agents/' + agentId);
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
        const ctx = createRequestContext(db, await devToken());

        await putAIMember(
            ctx, agentId,
            { ...aiDraft('Renamed'), skill_focus: 'qa' },
        );

        const detail = await getAIMemberEntity(ctx, agentId);
        assertStrictEquals(detail.name, 'Renamed');
        assertStrictEquals(detail.skill_focus, 'qa');
    },
);
