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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
        await seedTypeWithAttrs(ctx, 'rbfHGatkwQzGZJVXKJEeyw', [
            { id: 'UQBiHFcwJeCDSnmkPBoYRA', name: 'A1', sort_order: 3 },
        ]);
        const [attr] = await
            getRecordAttributesByRecord(
                ctx, 'rbfHGatkwQzGZJVXKJEeyw',
            );
        assert.deepEqual(attr, {
            id: 'UQBiHFcwJeCDSnmkPBoYRA',
            organizationId: 'AjdvjuECVZEgZoFajaIEkg',
            recordId: 'rbfHGatkwQzGZJVXKJEeyw',
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
        const a2 = generateIdentifier();
        await seedTypeWithAttrs(ctx, 'rbfHGatkwQzGZJVXKJEeyw', [
            { id: 'UQBiHFcwJeCDSnmkPBoYRA', name: 'A1', sort_order: 1 },
            { id: a2, name: 'A2', sort_order: 2 },
        ]);
        await seedTypeWithAttrs(ctx, 'rcaSzEaORBkezCxyhLhecA', [
            { id: generateIdentifier(), name: 'B1', sort_order: 1 },
        ]);
        const sRqRSyldQDFbqkDYSObDqw = await
            getRecordAttributesByRecord(
                ctx, 'rbfHGatkwQzGZJVXKJEeyw',
            );
        const ids = sRqRSyldQDFbqkDYSObDqw.map(a => a.id).sort();
        assert.deepEqual(
            ids, ['UQBiHFcwJeCDSnmkPBoYRA', a2].sort(),
        );
    },
);

test(
    'getRecordAttributesByRecord returns rows in'
    + ' sortOrder ascending',
    async () => {
        const { ctx } = await seededCtx();
        const midId = generateIdentifier();
        const firstId = generateIdentifier();
        const lastId = generateIdentifier();
        await seedTypeWithAttrs(ctx, 'rbfHGatkwQzGZJVXKJEeyw', [
            {
                id: midId, name: 'middle',
                sort_order: 5,
            },
            {
                id: firstId, name: 'first',
                sort_order: 1,
            },
            {
                id: lastId, name: 'last',
                sort_order: 10,
            },
        ]);
        const rows = await
            getRecordAttributesByRecord(
                ctx, 'rbfHGatkwQzGZJVXKJEeyw',
            );
        assert.deepEqual(
            rows.map(r => r.id),
            [firstId, midId, lastId],
        );
    },
);
