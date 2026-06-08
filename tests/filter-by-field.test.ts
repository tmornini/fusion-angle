import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    filterByField,
} from '../web-app/app/adapters/shared.ts';

test('filterByField keeps rows whose field equals value', () => {
    const rows = [
        { id: 'a', kind: 'x' },
        { id: 'b', kind: 'y' },
        { id: 'c', kind: 'x' },
    ];
    assert.deepEqual(
        filterByField(rows, 'kind', 'x').map(r => r.id),
        ['a', 'c']);
});

test('filterByField returns empty when nothing matches', () => {
    const rows = [{ id: 'a', kind: 'x' }];
    assert.deepEqual(filterByField(rows, 'kind', 'z'), []);
});
