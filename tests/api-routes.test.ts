import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

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
    'flows/any-flow/versions',
    'projects/any-project/flows',
    'work-orders',
    'flows/any-flow/work-orders',
    'states/any-state/field-values',
    'records',
    'record-attributes',
    'flows/any-flow/records',
    'ideas/any-idea/submissions',
    'objectives',
    'objectives/any-objective/revisions',
    'projects/any-project/objective-baseline-scores',
    'projects/any-project/objective-actual-scores',
    'states',
];

for (const route of COLLECTION_ROUTES) {
    test(
        `GET ${route} returns an array on an empty`
        + ` db`,
        async () => {
            const db = new MemoryDbAdapter();
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
