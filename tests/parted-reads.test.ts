import { assertEquals } from '@std/assert';
import { routes } from '../api/routes.ts';
import { routePatternOf } from '../api/route-surface.ts';

// The GET routes that still answer handler JSON instead of
// the stored response (spec §12). A conversion deletes its
// patterns here in the commit that converts them; the
// fourth spec empties the list, and the commit that does
// adds `## A response is one unit` to ARCHITECTURE.md.
const PARTED = [
    'ai-agents/',
    'ai-agents/:id/versions/',
    'ai-agents/:id/versions/:etag',
    'identities/',
    'identities/:id/credentials/',
    'identities/:id/credentials/:cid',
    'identities/:id/default-organization',
    'identities/:id/invitations/',
    'identities/:id/invitations/:id',
    'identities/:id/invitations/:id/versions/',
    'identities/:id/invitations/:id/versions/:etag',
    'identities/:id/organizations/',
    'identities/:id/pii',
    'identities/:id/providers/',
    'identities/:id/providers/:eid',
    'identities/:id/registration',
    'identities/:id/token-revocations/:rid',
    'identities/:id/tokens/',
    'identities/:id/tokens/:jti',
    'identities/:id/versions/',
    'identities/:id/versions/:etag',
    'organizations/:id',
    'organizations/:id/flows/',
    'organizations/:id/flows/:id',
    'organizations/:id/flows/:id/records/',
    'organizations/:id/flows/:id/records/:frid',
    'organizations/:id/flows/:id/tags/:name',
    'organizations/:id/flows/:id/versions/',
    'organizations/:id/flows/:id/versions/:etag',
    'organizations/:id/flows/:id/work-orders/',
    'organizations/:id/ideas/',
    'organizations/:id/ideas/:id/submissions/',
    'organizations/:id/ideas/:id/versions/',
    'organizations/:id/ideas/:id/versions/:etag',
    'organizations/:id/invitations/',
    'organizations/:id/invitations/:id',
    'organizations/:id/invitations/:id/versions/',
    'organizations/:id/invitations/:id/versions/:etag',
    'organizations/:id/objectives/',
    'organizations/:id/objectives/:id/revisions/',
    'organizations/:id/objectives/:id/versions/',
    'organizations/:id/objectives/:id/versions/:etag',
    'organizations/:id/projects/',
    'organizations/:id/projects/:id/flows/',
    'organizations/:id/projects/:id/objective-actual-scores/',
    'organizations/:id/projects/:id/'
        + 'objective-baseline-scores/',
    'organizations/:id/projects/:id/versions/',
    'organizations/:id/projects/:id/versions/:etag',
    'organizations/:id/versions/',
    'organizations/:id/versions/:etag',
    'organizations/:id/work-orders/',
    'organizations/:id/work-orders/:id/claim',
    'organizations/:id/work-orders/:id/history',
    'organizations/:organization-id/former-members/',
    'organizations/:organization-id/members/',
    'organizations/:organization-id/members/:identity-id',
    'organizations/:organization-id/members/:identity-id'
        + '/versions/',
    'organizations/:organization-id/members/:identity-id'
        + '/versions/:etag',
    'organizations/:organization-id/record-types/',
    'organizations/:organization-id/record-types/'
        + ':record-type-id',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/attributes/',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/attributes/:attribute-id',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/instances/',
    'organizations/:organization-id/record-types/'
        + ':record-type-id/instances/:instance-id',
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
