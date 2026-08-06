import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    postRecordChange,
} from '../web-app/app/adapters/records.ts';
import {
    getRecordAttributesByRecord,
} from
'../web-app/app/adapters/record-attributes.ts';

// Nested attributes via the flipped adapter (Task 21):
// getRecordAttributesByRecord GETs the per-type collection;
// fixtures land through nested composed create so the parent
// type exists for the collection probe.

async function seededCtx() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    const ctx = createRequestContext(
        db, await organizationToken(),
    );
    return { db, ctx };
}

async function seedTypeWithAttrs(
    ctx: RequestContext,
    typeId: string,
    attrs: readonly {
        id: string;
        name: string;
        sort_order: number;
    }[],
): Promise<void> {
    await postRecordChange(ctx, typeId, {
        kind: 'create',
        record: {
            name: typeId,
            description: '',
            position: 1,
        },
        attributes: attrs.map(a => ({
            id: a.id,
            record_id: typeId,
            name: a.name,
            attribute_type: 'text' as const,
            sort_order: a.sort_order,
            options: [],
            constraints: [],
        })),
        initialState: 'active',
    });
}

test(
    'getRecordAttributesByRecord maps storage rows'
    + ' to the camelCase domain shape',
    async () => {
        const { ctx } = await seededCtx();
        await seedTypeWithAttrs(ctx, 'rec-1', [
            { id: 'a-1', name: 'A1', sort_order: 3 },
        ]);
        const [attr] = await
            getRecordAttributesByRecord(
                ctx, 'rec-1',
            );
        assert.deepEqual(attr, {
            id: 'a-1',
            organizationId: '1',
            recordId: 'rec-1',
            name: 'A1',
            attributeType: 'text',
            sortOrder: 3,
            options: [],
            constraints: [],
            readRoles: ['member', 'admin'],
            writeRoles: ['member', 'admin'],
        });
    },
);

test(
    'getRecordAttributesByRecord returns only the'
    + ' attributes for the given recordId',
    async () => {
        const { ctx } = await seededCtx();
        await seedTypeWithAttrs(ctx, 'rec-1', [
            { id: 'a-1', name: 'A1', sort_order: 1 },
            { id: 'a-2', name: 'A2', sort_order: 2 },
        ]);
        await seedTypeWithAttrs(ctx, 'rec-2', [
            { id: 'b-1', name: 'B1', sort_order: 1 },
        ]);
        const rec1 = await
            getRecordAttributesByRecord(
                ctx, 'rec-1',
            );
        const ids = rec1.map(a => a.id).sort();
        assert.deepEqual(ids, ['a-1', 'a-2']);
    },
);

test(
    'getRecordAttributesByRecord returns rows in'
    + ' sortOrder ascending',
    async () => {
        const { ctx } = await seededCtx();
        await seedTypeWithAttrs(ctx, 'rec-1', [
            {
                id: 'a-mid', name: 'middle',
                sort_order: 5,
            },
            {
                id: 'a-first', name: 'first',
                sort_order: 1,
            },
            {
                id: 'a-last', name: 'last',
                sort_order: 10,
            },
        ]);
        const rows = await
            getRecordAttributesByRecord(
                ctx, 'rec-1',
            );
        assert.deepEqual(
            rows.map(r => r.id),
            ['a-first', 'a-mid', 'a-last'],
        );
    },
);
