import { operationIdHeader } from './operation-id-header.ts';
import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GETCollection } from './in-page-facade.ts';
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
import type { OrganizationEntity } from '../shared/types.ts';
import { seededMockDb } from './mock-seed.ts';
import { framedRequest } from './http-fixtures.ts';

const BASE = 'http://localhost';

Deno.test('GET /organizations is not a live collection',
() => {
    assertStrictEquals(
        matchRoute(routes, pathSegmentsOf('/organizations')),
        null,
    );
    assertStrictEquals(
        matchRoute(routes, pathSegmentsOf('/organizations/')),
        null,
    );
});

Deno.test('GET /identities/:id/organizations/ lists'
    + ' authorized organizations', async () => {
    const db = await seededMockDb();
    const identityId = buildMembers()[0]!.id;
    const parts = await GETCollection<OrganizationEntity>(
        db,
        'identities/' + identityId + '/organizations/',
        await devToken(identityId),
        operationIdHeader());
    assertStrictEquals(parts.length, 1);
});

Deno.test('GET /organizations 404s when authenticated',
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
            framedRequest(BASE + path, {
                headers: {
                    Authorization: 'Bearer ' + token,
                },
            }),
        );
        assertStrictEquals(res.status, 404, path);
    }
});

Deno.test('GET identities/:id/organizations/ is self or'
    + ' admin', async () => {
    const db = await seededMockDb();
    const otherId = buildMembers()[0]!.id;
    const res = await handleRequest(
        db,
        framedRequest(
            BASE + '/identities/XXZruirZyAOoRpNxaDnpSA/organizations/',
            {
                headers: {
                    Authorization: 'Bearer '
                        + await devToken(otherId),
                },
            },
        ),
    );
    assertStrictEquals(res.status, 403);
});

Deno.test('admin GET lists the path identity seats',
async () => {
    const db = await seededMockDb();
    const identityId = buildMembers()[0]!.id;
    // Admin claims name both seeded orgs; the path
    // identity holds one live seat. Claims of the
    // caller must not shape this list.
    const parts = await GETCollection<OrganizationEntity>(
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
        operationIdHeader());
    assertStrictEquals(parts.length, 1);
});

Deno.test('org-less GET identities/:id/organizations/'
    + ' answers 204', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const res = await handleRequest(
        db,
        framedRequest(
            BASE + '/identities/XXZruirZyAOoRpNxaDnpSA/organizations/',
            {
                headers: {
                    Authorization: 'Bearer ' + await devToken(),
                },
            },
        ),
    );
    assertStrictEquals(res.status, 204);
    assertStrictEquals(await res.text(), '');
});
