import { assert, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import type { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    conditionalOf,
    routes,
    type WriteMethod,
} from '../api/routes.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { apiRequest } from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const ORGANIZATION = '/organizations/AjdvjuECVZEgZoFajaIEkg';

function ideaDocument(title: string): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

// Counts the head reads of one family's documents; a
// refusal by form makes none (Interpretation I). The fence
// reads other documents, which this does not count.
function countHeadReads(
    db: MemoryDbAdapter,
    prefix: string,
): () => number {
    let reads = 0;
    const pairs = db.messagePairs as unknown as Record<
        string, (...args: unknown[]) => unknown
    >;
    for (const name of ['getHead', 'getHeadPair']) {
        const original = pairs[name]!.bind(db.messagePairs);
        pairs[name] = (...args: unknown[]) => {
            if (String(args[0]).startsWith(prefix)) {
                reads += 1;
            }
            return original(...args);
        };
    }
    return () => reads;
}

async function refusedBeforeAnyRead(
    method: string,
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>>,
): Promise<number> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const backend = db.backend as MemoryStorageBackend;
    const token = await organizationToken();
    const family = path.split('/').slice(0, 4).join('/')
        + '/';
    const reads = countHeadReads(db, family);
    const before = backend.statementExecutions();
    const response = await handleRequest(db, apiRequest({
        method, path, token, body, headers,
    }));
    await response.body?.cancel();
    assertStrictEquals(backend.statementExecutions(), before);
    assertStrictEquals(reads(), 0);
    return response.status;
}

Deno.test('every write route declares its conditional', () => {
    const verbs = [
        ['put', 'PUT'], ['post', 'POST'],
        ['patch', 'PATCH'], ['delete', 'DELETE'],
    ] as const;
    for (const route of routes) {
        const pattern = route.segments.join('/');
        for (const [slot, method] of verbs) {
            if (route[slot] === undefined) continue;
            const conditional = conditionalOf(
                pattern, method as WriteMethod,
            );
            assert(
                ['optional', 'required', 'in-order', 'none']
                    .includes(conditional),
                pattern + ' ' + method,
            );
        }
    }
});

Deno.test('a malformed If-Match is 400 before any read',
async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'PUT',
            ORGANIZATION + '/ideas/' + generateIdentifier(),
            ideaDocument('A'),
            { 'If-Match': 'nope' },
        ),
        400,
    );
});

Deno.test('a tag list on a document PUT is 400',
async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'PUT',
            ORGANIZATION + '/ideas/' + generateIdentifier(),
            ideaDocument('A'),
            {
                'If-Match': '"' + generateIdentifier()
                    + '", "' + generateIdentifier() + '"',
            },
        ),
        400,
    );
});

Deno.test('both conditionals are 412 before any read',
async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'PUT',
            ORGANIZATION + '/ideas/' + generateIdentifier(),
            ideaDocument('A'),
            {
                'If-Match': '"' + generateIdentifier() + '"',
                'If-None-Match': '*',
            },
        ),
        412,
    );
});

Deno.test('If-None-Match other than * is 400', async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'PUT',
            ORGANIZATION + '/ideas/' + generateIdentifier(),
            ideaDocument('A'),
            { 'If-None-Match': '"' + generateIdentifier() + '"' },
        ),
        400,
    );
});

Deno.test('a conditional on a create is 400', async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'POST',
            ORGANIZATION + '/objectives/',
            { id: generateIdentifier() },
            { 'If-Match': '"' + generateIdentifier() + '"' },
        ),
        400,
    );
});

Deno.test('an undo without If-Match is 428 before any read',
async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'POST',
            ORGANIZATION + '/flows/' + generateIdentifier()
                + '/undo',
            { eventId: generateIdentifier(), at: 'x' },
            {},
        ),
        428,
    );
});

Deno.test('an in-order route with If-None-Match is 400'
+ ' before any read', async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'POST',
            ORGANIZATION + '/flows/' + generateIdentifier()
                + '/undo',
            { eventId: generateIdentifier(), at: 'x' },
            { 'If-None-Match': '*' },
        ),
        400,
    );
});

Deno.test('a required PUT without a conditional is 428'
+ ' before any read', async () => {
    assertStrictEquals(
        await refusedBeforeAnyRead(
            'PUT',
            ORGANIZATION + '/flows/' + generateIdentifier(),
            { name: 'F' },
            {},
        ),
        428,
    );
});

// The control: a read of the family's head is counted, so a
// zero above is no blind counter.
Deno.test('countHeadReads counts a head read', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const path = ORGANIZATION + '/ideas/'
        + generateIdentifier();
    const born = await handleRequest(db, apiRequest({
        method: 'PUT', path, token,
        body: ideaDocument('A'),
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(born.status, 201);
    await born.body?.cancel();
    const reads = countHeadReads(db, ORGANIZATION + '/ideas/');
    const read = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    assertStrictEquals(read.status, 200);
    await read.body?.cancel();
    assert(reads() > 0);
});

Deno.test('a PUT with no body is 400', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const response = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: ORGANIZATION + '/ideas/' + generateIdentifier(),
        token,
    }));
    assertStrictEquals(response.status, 400);
    await response.body?.cancel();
});

Deno.test('a declared genesis is 201 fresh, 412 on a live'
    + ' document', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const path = ORGANIZATION + '/ideas/'
        + generateIdentifier();
    const born = await handleRequest(db, apiRequest({
        method: 'PUT', path, token,
        body: ideaDocument('A'),
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(born.status, 201);
    await born.body?.cancel();
    const again = await handleRequest(db, apiRequest({
        method: 'PUT', path, token,
        body: ideaDocument('B'),
        headers: { 'If-None-Match': '*' },
    }));
    assertStrictEquals(again.status, 412);
    await again.body?.cancel();
});
