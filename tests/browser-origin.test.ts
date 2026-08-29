import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    ADMIN_EMAIL,
    adminToken,
    passwordOf,
    startOrigin,
} from './browser/fixtures.ts';

// The list route the API actually exposes: there is no
// /api/organizations/ collection, so the origin proves
// itself on the seats route tests/api-human-members.ts
// reads, in the same organization adminToken() scopes to.
const MEMBERS_PATH = '/api/organizations/'
    + STARK_ORGANIZATION + '/members/';

test('the in-process origin serves the seeded API',
async () => {
    const staticRoot = mkdtempSync(join(
        process.env['TMPDIR'] ?? tmpdir(),
        'fusion-origin-',
    ));
    process.env['FUSION_ANGLE_STATIC_ROOT'] = staticRoot;
    const origin = await startOrigin();
    try {
        assert.ok(
            passwordOf(origin.credentials, ADMIN_EMAIL)
                .length > 0,
        );
        const anonymous = await fetch(
            origin.baseUrl + MEMBERS_PATH,
        );
        assert.equal(anonymous.status, 401);
        const bearer = await fetch(
            origin.baseUrl + MEMBERS_PATH,
            { headers: {
                Authorization: 'Bearer '
                    + await adminToken(),
            } },
        );
        assert.equal(bearer.status, 200);
        const rows = await bearer.json() as Array<{
            identity_id: string;
        }>;
        assert.ok(rows.length > 0);
    } finally {
        await origin.close();
        rmSync(staticRoot, { recursive: true, force: true });
    }
});
