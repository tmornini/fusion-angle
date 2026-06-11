import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adminContext } from './context-fixtures.ts';
import { jsonArrayField } from '../api/types.ts';
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
        options: jsonArrayField([]),
        constraints: jsonArrayField([]),
    };
}

test(
    'getRecordAttributesByRecord returns only the'
    + ' attributes for the given record_id',
    async () => {
        const { db, ctx } = await adminContext();
        await db.recordAttributes.put(
            'a-1', attributeRow('rec-1', 'A1', 1));
        await db.recordAttributes.put(
            'a-2', attributeRow('rec-1', 'A2', 2));
        await db.recordAttributes.put(
            'b-1', attributeRow('rec-2', 'B1', 1));
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
    + ' sort_order ascending',
    async () => {
        const { db, ctx } = await adminContext();
        await db.recordAttributes.put(
            'a-mid', attributeRow('rec-1', 'middle', 5));
        await db.recordAttributes.put(
            'a-first', attributeRow('rec-1', 'first', 1));
        await db.recordAttributes.put(
            'a-last', attributeRow('rec-1', 'last', 10));
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
