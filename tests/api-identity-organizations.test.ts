import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { routes, matchRoute } from
    '../api/routes.ts';
import { pathSegmentsOf } from
    '../api/path-segments.ts';
import {
    claimToken,
    devToken,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import type { OrganizationEntity } from '../api/types.ts';
import { seededMockDb } from './mock-seed.ts';

const BASE = 'http://localhost';

test('GET /organizations is not a live collection',
() => {
    assert.equal(
        matchRoute(routes, pathSegmentsOf('/organizations')),
        null,
    );
    assert.equal(
        matchRoute(routes, pathSegmentsOf('/organizations/')),
        null,
    );
});

test('GET /identities/:id/organizations/ lists'
    + ' authorized organizations', async () => {
    const db = await seededMockDb();
    const identityId = buildMembers()[0]!.id;
    const rows = await GET<OrganizationEntity[]>(
        db,
        'identities/' + identityId + '/organizations/',
        await devToken(identityId),
    );
    assert.equal(rows.length, 1);
});

test('GET /organizations 404s when authenticated',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    for (const path of [
        '/organizations',
        '/organizations/',
    ]) {
        const res = await handleRequest(
            db,
            new Request(BASE + path, {
                headers: {
                    Authorization: 'Bearer ' + token,
                },
            }),
        );
        assert.equal(res.status, 404, path);
    }
});

test('GET identities/:id/organizations/ is self or'
    + ' admin', async () => {
    const db = await seededMockDb();
    const otherId = buildMembers()[0]!.id;
    const res = await handleRequest(
        db,
        new Request(
            BASE + '/identities/XXZruirZyAOoRpNxaDnpSA/organizations/',
            {
                headers: {
                    Authorization: 'Bearer '
                        + await devToken(otherId),
                },
            },
        ),
    );
    assert.equal(res.status, 403);
});

test('admin GET lists the path identity seats',
async () => {
    const db = await seededMockDb();
    const identityId = buildMembers()[0]!.id;
    // Admin claims name both seeded orgs; the path
    // identity holds one live seat. Claims of the
    // caller must not shape this list.
    const rows = await GET<OrganizationEntity[]>(
        db,
        'identities/' + identityId + '/organizations/',
        await claimToken({
            organizations: ['AjdvjuECVZEgZoFajaIEkg'
                , 'BBjWJsjYIDkTRKIIPrzWRw'],
            roles: [
                'admin:AjdvjuECVZEgZoFajaIEkg',
                'admin:BBjWJsjYIDkTRKIIPrzWRw',
            ],
        }),
    );
    assert.equal(rows.length, 1);
});

test('org-less GET identities/:id/organizations/'
    + ' returns an empty list', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const rows = await GET<OrganizationEntity[]>(
        db,
        'identities/XXZruirZyAOoRpNxaDnpSA/organizations/',
        await devToken(),
    );
    assert.deepEqual(rows, []);
});
