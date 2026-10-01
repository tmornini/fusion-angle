import { assertEquals } from '@std/assert';
import { routes } from '../api/routes.ts';
import { routePatternOf } from '../api/route-surface.ts';

// The GET routes that still answer handler JSON instead of
// the stored response (spec §12). A conversion deletes its
// patterns here in the commit that converts them; the
// fourth spec empties the list, and the commit that does
// adds `## A response is one unit` to ARCHITECTURE.md.
const PARTED = [
    'ai-agents/:id/versions/',
    'ai-agents/:id/versions/:etag',
    'identities/:id/invitations/',
    'identities/:id/invitations/:id',
    'identities/:id/invitations/:id/versions/',
    'identities/:id/invitations/:id/versions/:etag',
    'identities/:id/versions/',
    'identities/:id/versions/:etag',
    'organizations/:id/flows/:id/versions/',
    'organizations/:id/flows/:id/versions/:etag',
    'organizations/:id/ideas/:id/versions/',
    'organizations/:id/ideas/:id/versions/:etag',
    'organizations/:id/invitations/',
    'organizations/:id/invitations/:id',
    'organizations/:id/invitations/:id/versions/',
    'organizations/:id/invitations/:id/versions/:etag',
    'organizations/:id/objectives/:id/versions/',
    'organizations/:id/objectives/:id/versions/:etag',
    'organizations/:id/projects/:id/versions/',
    'organizations/:id/projects/:id/versions/:etag',
    'organizations/:id/versions/',
    'organizations/:id/versions/:etag',
    'organizations/:id/work-orders/:id/history',
    'organizations/:organization-id/former-members/',
    'organizations/:organization-id/members/:identity-id'
        + '/versions/',
    'organizations/:organization-id/members/:identity-id'
        + '/versions/:etag',
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
