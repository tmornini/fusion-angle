import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { GET, GETCollection } from './in-page-facade.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import type { OrganizationEntity } from '../shared/types.ts';
import { seededMockDb } from './mock-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from './operation-id-header.ts';

// Pin the collection routes that handleRequest
// must serve. A new top-level resource is added
// by adding both: an entry in api/api.ts's
// route table, AND its name here. Adding the
// resource here forces the deferred MemoryDb
// store to exist too — the GET round-trips end
// to end.
const ANY_ID = generateIdentifier();
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
// The collections that serve their heads as parts.
const SERVED_COLLECTIONS: readonly string[] = [
    'ai-agents/',
    'identities/' + ANY_ID + '/organizations/',
    'organizations/' + STARK + '/ideas/',
    'organizations/' + STARK + '/projects/',
    'organizations/' + STARK + '/work-orders/',
    'organizations/' + STARK + '/objectives/',
    'organizations/' + STARK + '/flows/',
    'organizations/' + STARK + '/flows/'
        + ANY_ID + '/work-orders/',
    'organizations/' + STARK + '/flows/'
        + ANY_ID + '/records/',
    'organizations/' + STARK + '/record-types/',
    'organizations/' + STARK + '/projects/'
        + ANY_ID + '/flows/',
    'organizations/' + STARK + '/ideas/'
        + ANY_ID + '/submissions/',
    'organizations/' + STARK + '/objectives/'
        + ANY_ID + '/revisions/',
    'organizations/' + STARK + '/projects/'
        + ANY_ID + '/objective-baseline-scores/',
    'organizations/' + STARK + '/projects/'
        + ANY_ID + '/objective-actual-scores/',
];
// The collections still answering handler JSON.
const PARTED_COLLECTIONS: readonly string[] = [
    'organizations/' + STARK + '/members/',
    // GET states/:id/field-values RETIRED (C4); field values
    // fold on work-orders/:id/history.
    // Bulk lifecycle collection RETIRED (states-URI
    // elimination C3).
];

for (const route of SERVED_COLLECTIONS) {
    Deno.test(
        `GET ${route} selects nothing on an empty db`,
        async () => {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const parts = await GETCollection(
                db, route, await devToken(), operationIdHeader(),
            );
            assertEquals(parts, []);
        },
    );
}

for (const route of PARTED_COLLECTIONS) {
    Deno.test(
        `GET ${route} returns an array on an empty`
        + ` db`,
        async () => {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const rows =
                (await GET<unknown[]>(
                    db, route, await devToken(), operationIdHeader()))
                        .body().toValue();
            assert(
                Array.isArray(rows),
                route + ' should return an array',
            );
        },
    );
}

// Enumeration lives on the identity nest. A
// SINGLE-organization caller sees only their own
// membership org, never every seeded org.
Deno.test('GET /identities/:id/organizations/ self-fences'
+ ' to the path identity\'s own memberships',
async () => {
    const db = await seededMockDb();
    const singleOrganizationIdentityId = buildMembers()[0]!.id;
    const parts = await GETCollection<OrganizationEntity>(
        db,
        'identities/' + singleOrganizationIdentityId
            + '/organizations/',
        await devToken(singleOrganizationIdentityId),
        operationIdHeader());
    assertStrictEquals(parts.length, 1);
});
