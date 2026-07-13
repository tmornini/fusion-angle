import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import type { OrganizationEntity } from '../api/types.ts';

// Pin the collection routes that handleRequest
// must serve. A new top-level resource is added
// by adding both: an entry in api/api.ts's
// route table, AND its name here. Adding the
// resource here forces the deferred MemoryDb
// store to exist too — the GET round-trips end
// to end.
const COLLECTION_ROUTES: readonly string[] = [
    'organizations',
    'memberships',
    'members',
    'ai-members',
    'role-grants',
    'ideas',
    'projects',
    'flows',
    'projects/any-project/flows',
    'work-orders',
    'work-orders/history',
    'flows/any-flow/work-orders',
    // GET states/:id/field-values RETIRED (C4); field values
    // fold on work-orders/:id/history.
    'records',
    'record-attributes',
    'flows/any-flow/records',
    'ideas/any-idea/submissions',
    'objectives',
    'objectives/history',
    'objectives/any-objective/revisions',
    'projects/any-project/objective-baseline-scores',
    'projects/any-project/objective-actual-scores',
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

// GET /organizations routes through the pre-matchRoute guard in
// handleRequest (api.ts), never the route('organizations', {get})
// table entry — that entry was dead code, unreachable by
// construction, and is now REMOVED (API.md §5.18 carries the
// control-flow argument). Proof: a SINGLE-organization caller
// sees ONLY their own
// membership org here, never every seeded org — the surviving
// path (organizationsEnumerationRequest) self-fences to the
// caller's memberships; the removed table entry's own handler
// (db.organizations.getAll(), unfenced) would have returned BOTH
// seeded orgs had it ever been reached.
test('GET /organizations self-fences to the caller\'s own'
+ ' memberships — the membership-filtered path, never the'
+ ' removed unfenced route table entry', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db);
    const singleOrganizationIdentityId = buildMembers()[0]!.id;
    const rows = await GET<OrganizationEntity[]>(
        db, 'organizations',
        await devToken(singleOrganizationIdentityId),
    );
    assert.equal(rows.length, 1);
});
