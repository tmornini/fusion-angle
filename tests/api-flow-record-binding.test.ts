import { assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// PUT organizations/:id/flows/:id/records/:frid — bind a flow
// to a record. The record must exist in the caller's
// organization: a miss is 404 (EntityNotFoundError — never
// missedReadError's 403, which would be an existence oracle)
// and appends nothing.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const FLOW_ID = generateIdentifier();
const RECORD_ID = generateIdentifier();
const RECORD_MISSING = generateIdentifier();
const FR_ID = generateIdentifier();
const FR_MISSING = generateIdentifier();

const BINDINGS =
    '/organizations/' + ORGANIZATION
    + '/flows/' + FLOW_ID + '/records/';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function messagePairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.messagePairs.getAll()).length;
}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/' + ORGANIZATION + '/flows/',
        token,
        {
            id: FLOW_ID,
            flow: {
                name: 'Bind Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: generateIdentifier(),
                flow_id: FLOW_ID,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assertStrictEquals(res.status, 201);
}

async function seedRecord(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION
            + '/record-types/' + RECORD_ID,
        token,
        {
            name: 'Bind Record',
            description: '',
            position: 1,
            state: 'active',
        },
    ));
    assertStrictEquals(res.status, 201);
}

async function seededDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    const token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION,
    );
    await seedFlow(db, token);
    await seedRecord(db, token);
    return { db, token };
}

Deno.test('binding an absent record → 404 and appends nothing',
async () => {
    const { db, token } = await seededDb();
    const before = await messagePairCount(db);
    const res = await handleRequest(db, req(
        'PUT', BINDINGS + FR_MISSING, token,
        {
            flow_id: FLOW_ID,
            record_id: RECORD_MISSING,
            at: AT,
        },
    ));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error, 'Not found: records/' + RECORD_MISSING,
    );
    assertStrictEquals(await messagePairCount(db), before);
});

Deno.test('binding an existing record still 201s and reads back',
async () => {
    const { db, token } = await seededDb();
    const res = await handleRequest(db, req(
        'PUT', BINDINGS + FR_ID, token,
        { flow_id: FLOW_ID, record_id: RECORD_ID, at: AT },
    ));
    assertStrictEquals(res.status, 201);
    const read = await handleRequest(db, req(
        'GET', BINDINGS + FR_ID, token,
    ));
    assertStrictEquals(read.status, 200);
    const bound = await read.json() as { record_id: string };
    assertStrictEquals(bound.record_id, RECORD_ID);
});
