import { assertStrictEquals } from '@std/assert';
import { TABLE_INDEXES } from '../api/db.ts';

// TABLE_INDEXES is the memory backend's unique-
// column manifest and the SVG's secondary-index list; the
// seam's reads are typed, so no column-literal manifest is
// needed.

Deno.test('message_pairs carry no unique follows index', () => {
    const cols = TABLE_INDEXES['message_pairs'] ?? [];
    assertStrictEquals(
        cols.some(
            (spec) =>
                typeof spec !== 'string'
                && spec.column === 'follows',
        ),
        false,
    );
});
