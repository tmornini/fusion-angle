import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { RequestError } from '../shared/http-errors.ts';
import { GETCollection } from './in-page-facade.ts';
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
function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

const SERVED_COLLECTIONS: readonly string[] = [
    'organizations/' + STARK + '/ai-agents/',
    'organizations/' + STARK + '/services/',
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

Deno.test(
    'GET identities/:id/organizations/ on an outsider'
    + ' is forbidden',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const route = 'identities/' + ANY_ID + '/organizations/';
        const token = await devToken();
        const err = await assertRejects(
            () => GETCollection(
                db, route, token,
                operationIdHeader(),
            ),
            RequestError,
        );
        assertStrictEquals(err.status, 403);
        assertStrictEquals(
            err.message,
            outside('GET', '/' + route) + ' ()',
        );
    },
);

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

// The admin seat seedAdminSchema writes is the roster's one
// part.
Deno.test(
    'GET organizations/' + STARK
    + '/memberships/?state=accepted serves the'
    + ' admin membership on an empty db',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const parts = await GETCollection(
            db, 'organizations/' + STARK
                + '/memberships/?state=accepted',
            await devToken(), operationIdHeader(),
        );
        assertStrictEquals(parts.length, 1);
    },
);

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
