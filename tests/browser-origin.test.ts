import { assert, assertStrictEquals } from '@std/assert';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    ADMIN_EMAIL,
    adminToken,
    passwordOf,
    startOrigin,
} from './browser/fixtures.ts';
import { fetchDiscardingBody } from
    './fixtures/fetch-discarding-body.ts';

// The list route the API actually exposes: there is no
// /api/organizations/ collection, so the origin proves
// itself on the seats route tests/api-human-members.ts
// reads, in the same organization adminToken() scopes to.
const MEMBERS_PATH = '/api/organizations/'
    + STARK_ORGANIZATION + '/members/';

Deno.test('the in-process origin serves the seeded API',
async () => {
    const staticRoot = Deno.makeTempDirSync({
        prefix: 'fusion-origin-',
    });
    Deno.env.set('FUSION_ANGLE_STATIC_ROOT', staticRoot);
    const origin = await startOrigin();
    try {
        assert(
            passwordOf(origin.credentials, ADMIN_EMAIL)
                .length > 0,
        );
        const anonymous = await fetchDiscardingBody(
            origin.baseUrl + MEMBERS_PATH,
        );
        assertStrictEquals(anonymous.status, 401);
        const bearer = await fetch(
            origin.baseUrl + MEMBERS_PATH,
            { headers: {
                Authorization: 'Bearer '
                    + await adminToken(),
            } },
        );
        assertStrictEquals(bearer.status, 200);
        const rows = await bearer.json() as Array<{
            identity_id: string;
        }>;
        assert(rows.length > 0);
    } finally {
        await origin.close();
        Deno.removeSync(staticRoot, { recursive: true });
    }
});
