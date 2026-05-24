import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

// Pin the collection routes that handleRequest
// must serve. A new top-level resource is added
// by adding both: an entry in api/api.ts's
// route table, AND its name here. Adding the
// resource here forces the deferred MemoryDb
// store to exist too — the GET round-trips end
// to end.
const COLLECTION_ROUTES: readonly string[] = [
    'workers',
    'ai-workers',
    'ideas',
    'projects',
    'flows',
    'flow-versions',
    'project-flows',
    'work-orders',
    'flow-work-orders',
    'state-field-values',
    'records',
    'record-attributes',
    'flow-records',
    'idea-submissions',
    'objectives',
    'objective-revisions',
    'project-objective-baseline-scores',
    'project-objective-actual-scores',
    'states',
];

for (const route of COLLECTION_ROUTES) {
    test(
        `GET ${route} returns an array on an empty`
        + ` db`,
        async () => {
            const db = new MemoryDbAdapter();
            const rows =
                await GET<unknown[]>(db, route);
            assert.ok(
                Array.isArray(rows),
                route + ' should return an array',
            );
        },
    );
}
