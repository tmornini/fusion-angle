import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import type { OrganizationEntity } from '../api/types.ts';
import { seededMockDb } from './mock-seed.ts';

// Pin the collection routes that handleRequest
// must serve. A new top-level resource is added
// by adding both: an entry in api/api.ts's
// route table, AND its name here. Adding the
// resource here forces the deferred MemoryDb
// store to exist too — the GET round-trips end
// to end.
const COLLECTION_ROUTES: readonly string[] = [
    'identities/any-id/organizations/',
    'organizations/1/members/',
    'ai-agents/',
    'organizations/1/ideas/',
    'organizations/1/projects/',
    'organizations/1/flows/',
    'organizations/1/projects/any-project/flows/',
    'organizations/1/work-orders/',
    'organizations/1/flows/any-flow/work-orders/',
    // GET states/:id/field-values RETIRED (C4); field values
    // fold on work-orders/:id/history.
    'organizations/1/record-types/',
    'organizations/1/flows/any-flow/records/',
    'organizations/1/ideas/any-idea/submissions/',
    'organizations/1/objectives/',
    'organizations/1/objectives/any-objective/revisions/',
    'organizations/1/projects/any-project'
        + '/objective-baseline-scores/',
    'organizations/1/projects/any-project'
        + '/objective-actual-scores/',
    // Bulk lifecycle collection RETIRED (states-URI
    // elimination C3).
];

for (const route of COLLECTION_ROUTES) {
    test(
        `GET ${route} returns an array on an empty`
        + ` db`,
        async () => {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const rows =
                await GET<unknown[]>(
                    db, route, await devToken());
            assert.ok(
                Array.isArray(rows),
                route + ' should return an array',
            );
        },
    );
}

// Enumeration lives on the identity nest. A
// SINGLE-organization caller sees only their own
// membership org, never every seeded org.
test('GET /identities/:id/organizations/ self-fences'
+ ' to the path identity\'s own memberships',
async () => {
    const db = await seededMockDb();
    const singleOrganizationIdentityId = buildMembers()[0]!.id;
    const rows = await GET<OrganizationEntity[]>(
        db,
        'identities/' + singleOrganizationIdentityId
            + '/organizations/',
        await devToken(singleOrganizationIdentityId),
    );
    assert.equal(rows.length, 1);
});
