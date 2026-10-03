import { assertEquals } from '@std/assert';
import { routes } from '../api/routes.ts';
import { routePatternOf } from '../api/route-surface.ts';

// The GET routes that still answer handler JSON instead of
// the stored response (spec §12). A conversion deletes its
// patterns here in the commit that converts them. The fourth
// spec leaves `…/work-orders/:id/history`; the fifth builds
// it once, and its commit that empties the list adds
// `## A response is one unit` to ARCHITECTURE.md (spec §12,
// `## For the next brainstorms`).
const PARTED = [
    'organizations/:id/flows/:id/versions/',
    'organizations/:id/flows/:id/versions/:etag',
    'organizations/:id/objectives/:id/versions/',
    'organizations/:id/objectives/:id/versions/:etag',
    'organizations/:id/projects/:id/versions/',
    'organizations/:id/projects/:id/versions/:etag',
    'organizations/:id/versions/',
    'organizations/:id/versions/:etag',
    'organizations/:id/work-orders/:id/history',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/instances/:instance-id/versions',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/instances/:instance-id/versions/'
        + ':etag',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/versions/',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/versions/:etag',
];

Deno.test('the parted GET routes are exactly the census',
() => {
    assertEquals(
        routes.filter((row) => row.get !== undefined)
            .map(routePatternOf).sort(),
        [...PARTED].sort(),
    );
});

Deno.test('no route both parts and selects its GET', () => {
    assertEquals(
        routes.filter((row) =>
            row.get !== undefined && row.select !== undefined)
            .map(routePatternOf),
        [],
    );
});
