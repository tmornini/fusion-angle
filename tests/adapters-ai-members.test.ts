import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postAIMemberStateChange,
} from '../web-app/app/adapters/ai-members.ts';
import {
    seedHumanMember,
    seedAIMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

test(
    'postAIMemberStateChange records a state event'
    + ' without touching the AI member row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'current', 'Demo User');
        await seedAIMember(db, 'ai1', 'Claude');
        const before =
            await db.aiMembers.getById('ai1');
        const ctx = createRequestContext(db, await devToken());

        await postAIMemberStateChange(
            ctx, 'ai1', 'archived',
        );

        const after =
            await db.aiMembers.getById('ai1');
        assert.deepEqual(after, before);
        const events = await db.states.getAllFor('ai1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);
