import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adminContext } from './context-fixtures.ts';
import {
    getRecordAttributesByRecord,
} from
'../web-app/app/adapters/record-attributes.ts';

function attributeRow(
    recordId: string,
    name: string,
    sortOrder: number,
) {
    return {
        organization_id: '1',
        record_id: recordId,
        name,
        attribute_type: 'text' as const,
        sort_order: sortOrder,
        options: [],
        constraints: [],
    };
}

test(
    'getRecordAttributesByRecord maps storage rows'
    + ' to the camelCase domain shape',
    async () => {
        const { ctx } = await adminContext();
        // NAMED re-pin (Task 7): getRecordAttributesByRecord
        // reads record-attributes through the flipped GET (this
        // commit) — a raw db.recordAttributes.put leaves no
        // message pair at this address, so the fixture must land
        // through the SAME wire-reachable PUT the live route
        // serves.
        await ctx.PUT(
            'record-attributes/a-1',
            attributeRow('rec-1', 'A1', 3),
        );
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
        });
    },
);

test(
    'getRecordAttributesByRecord returns only the'
    + ' attributes for the given recordId',
    async () => {
        const { ctx } = await adminContext();
        await ctx.PUT(
            'record-attributes/a-1',
            attributeRow('rec-1', 'A1', 1),
        );
        await ctx.PUT(
            'record-attributes/a-2',
            attributeRow('rec-1', 'A2', 2),
        );
        await ctx.PUT(
            'record-attributes/b-1',
            attributeRow('rec-2', 'B1', 1),
        );
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
        const { ctx } = await adminContext();
        await ctx.PUT(
            'record-attributes/a-mid',
            attributeRow('rec-1', 'middle', 5),
        );
        await ctx.PUT(
            'record-attributes/a-first',
            attributeRow('rec-1', 'first', 1),
        );
        await ctx.PUT(
            'record-attributes/a-last',
            attributeRow('rec-1', 'last', 10),
        );
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
