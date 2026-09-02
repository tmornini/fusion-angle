import { assertEquals } from '@std/assert';
import {
    filterByField,
} from '../web-app/app/adapters/shared.ts';

Deno.test('filterByField keeps rows whose field equals value', () => {
    const rows = [
        { id: 'a', kind: 'x' },
        { id: 'b', kind: 'y' },
        { id: 'c', kind: 'x' },
    ];
    assertEquals(
        filterByField(rows, 'kind', 'x').map(r => r.id),
        ['a', 'c']);
});

Deno.test('filterByField returns empty when nothing matches', () => {
    const rows = [{ id: 'a', kind: 'x' }];
    assertEquals(filterByField(rows, 'kind', 'z'), []);
});
