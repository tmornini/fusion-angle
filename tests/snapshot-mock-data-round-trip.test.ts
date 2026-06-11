// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getSnapshot,
    putSnapshot,
} from '../web-app/app/adapters/snapshots.ts';

// The snapshot a running app exports must re-import.
// seed -> getSnapshot -> putSnapshot is the round trip
// no other test exercises. ai_members.name is a current
// column (api/types.ts AIMemberEntity.name, seeded at
// api/mock-data.ts) — a stale retired-key entry once
// made the exporter emit what the importer rejected.
test(
    'a seeded snapshot re-imports and keeps an AI'
    + ' member name',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await postMockDataLoad(db);
        const ctx = createRequestContext(
            db, await devToken(),
        );
        const json = await getSnapshot(ctx);
        await putSnapshot(ctx, json);
        const ai = (await db.aiMembers.getAll())
            .find(m => m.id === 'tuJwPxYtBur2KCLquScShB');
        assert.equal(ai?.name, 'Claude Opus 4.8');
    },
);
