import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test(
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
        assert.equal(detail.name, 'Claude');
        const agent = await ctx.GET<{
            id: string; name: string;
        }>('ai-agents/' + agentId);
        assert.equal(agent.name, 'Claude');
    },
);

test(
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
        assert.equal(detail.name, 'Renamed');
        assert.equal(detail.skill_focus, 'qa');
    },
);
