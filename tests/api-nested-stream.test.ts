import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';
import {
    deriveIdeaSubmissions,
    ideaSubmissionEntityOf,
} from '../api/derive-ideas.ts';
import {
    deriveProjectFlows,
    projectFlowEntityOf,
} from '../api/derive-project-flows.ts';
import {
    deriveFlowWorkOrders,
    flowWorkOrderEntityOf,
} from '../api/derive-flow-work-orders.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
    flowRecordEntityOf,
} from '../api/derive-flow-records.ts';
import {
    deriveFlowTag,
    flowTagEntityOf,
} from '../api/derive-flow-tags.ts';
import {
    deriveObjectiveRevisions,
    objectiveRevisionEntityOf,
} from '../api/derive-objective-revisions.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
    scoreEntityOf,
} from '../api/derive-project-scores.ts';
import { nestedAttributeWireOf } from '../api/routes.ts';

// G6: stored PUT = today's GET derive (*EntityOf). Pin
// GET == stored PUT body for each nested family.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';

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

async function freshDb(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, token: await organizationToken() };
}

function ideaDocument(title: string, _ev: string) {
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

function emptyDelta() {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

async function createFlow(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
    projectId: string,
): Promise<void> {
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token,
        {
            id: flowId,
            flow: {
                name: 'G6 Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: generateIdentifier(),
            projectFlow: {
                project_id: projectId,
                flow_id: flowId,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
            graphDelta: emptyDelta(),
        },
    ));
    assert.equal(created.status, 201);
}

function storedDoc(
    uriId: string,
    body: Record<string, unknown>,
) {
    return {
        uriId,
        messagePairId: uriId,
        method: 'PUT',
        body,
    };
}

test('stored PUT body equals ideaSubmissionEntityOf',
async () => {
    const { db, token } = await freshDb();
    const ideaId = generateIdentifier();
    const sid = generateIdentifier();
    const putIdea = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId, token,
        ideaDocument('G6 Idea', 'ev-g6'),
    ));
    assert.equal(putIdea.status, 201);
    const fields = {
        idea_id: ideaId,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/submissions/' + sid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/ideas/' + ideaId + '/submissions/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, sid),
    );
    const expected = ideaSubmissionEntityOf(
        storedDoc(sid, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveIdeaSubmissions(
        db, ORGANIZATION, ideaId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/submissions/', token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});

test('stored PUT body equals projectFlowEntityOf',
async () => {
    const { db, token } = await freshDb();
    const projectId = generateIdentifier();
    const pfid = generateIdentifier();
    const fields = {
        project_id: projectId,
        flow_id: generateIdentifier(),
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
            + '/flows/' + pfid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/projects/' + projectId + '/flows/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, pfid),
    );
    const expected = projectFlowEntityOf(
        storedDoc(pfid, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveProjectFlows(
        db, ORGANIZATION, projectId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + projectId + '/flows/', token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});

test('stored PUT body equals flowWorkOrderEntityOf',
async () => {
    const { db, token } = await freshDb();
    const flowId = generateIdentifier();
    const woid = generateIdentifier();
    await createFlow(db, token, flowId, generateIdentifier());
    const fields = {
        flow_id: flowId,
        work_order_id: generateIdentifier(),
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/work-orders/' + woid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/flows/' + flowId + '/work-orders/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, woid),
    );
    const expected = flowWorkOrderEntityOf(
        storedDoc(woid, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveFlowWorkOrders(
        db, ORGANIZATION, flowId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/work-orders/', token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});

test('stored PUT body equals flowRecordEntityOf',
async () => {
    const { db, token } = await freshDb();
    const flowId = generateIdentifier();
    const frid = generateIdentifier();
    await createFlow(db, token, flowId, generateIdentifier());
    const fields = {
        flow_id: flowId,
        record_id: generateIdentifier(),
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId + '/records/'
            + '' + frid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/flows/' + flowId + '/records/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, frid),
    );
    const expected = flowRecordEntityOf(
        storedDoc(frid, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveFlowRecords(
        db, ORGANIZATION, flowId,
    );
    assert.deepEqual(derived, [expected]);
    assert.deepEqual(
        stored,
        await deriveFlowRecord(
            db, ORGANIZATION, flowId, frid,
        ),
    );
    const list = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/records/', token,
    ));
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [stored]);
    const got = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId + '/records/'
            + '' + frid,
        token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), stored);
});

test('stored PUT body equals flowTagEntityOf',
async () => {
    const { db, token } = await freshDb();
    const flowId = generateIdentifier();
    await createFlow(db, token, flowId, generateIdentifier());
    const head = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId, token,
    ));
    const responseId = head.headers.get('Response-ID');
    assert.ok(responseId);
    const name = 'xDyDkxEPwtcNmJVknUHDsg';
    const fields = { flow_response_id: responseId };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId + '/tags/'
            + name,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/flows/' + flowId + '/tags/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, name),
    );
    const expected = flowTagEntityOf(
        flowId, storedDoc(name, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    assert.deepEqual(
        stored,
        await deriveFlowTag(
            db, ORGANIZATION, flowId, name,
        ),
    );
    const got = await handleRequest(db, req(
        'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + flowId
            + '/tags/' + name, token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), stored);
});

test('stored PUT body equals nestedAttributeWireOf',
async () => {
    const { db, token } = await freshDb();
    const typeId = generateIdentifier();
    const attrId = generateIdentifier();
    const typePut = await handleRequest(db, req(
        'PUT',
        '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId,
        token,
        {
            name: 'G6 Type',
            description: 'd',
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(typePut.status, 201);
    const fields = {
        name: 'Priority',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
    };
    const path = '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId
        + '/attributes/' + attrId;
    const put = await handleRequest(db, req(
        'PUT', path, token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId + '/attributes/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, attrId),
    );
    const expected = nestedAttributeWireOf(
        ORGANIZATION, typeId, attrId, fields,
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const got = await handleRequest(db, req(
        'GET', path, token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), stored);
    const list = await handleRequest(db, req(
        'GET',
        '/organizations/' + ORGANIZATION
        + '/record-types/' + typeId + '/attributes/',
        token,
    ));
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [stored]);
});

test('stored PUT body equals objectiveRevisionEntityOf',
async () => {
    const { db, token } = await freshDb();
    const objectiveId = generateIdentifier();
    const rid = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', token,
        {
            id: objectiveId,
            objective: { position: 1 },
            revisionId: rid,
            revision: {
                objective_id: objectiveId,
                name: 'Revenue',
                description: 'd',
                member_id: 'XXZruirZyAOoRpNxaDnpSA',
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: generateIdentifier(),
            initialStateAt: AT,
        },
    ));
    assert.equal(created.status, 201);
    const fields = {
        objective_id: objectiveId,
        name: 'Revenue',
        description: 'd',
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
    };
    const prefix = '/organizations/' + ORGANIZATION
        + '/objectives/' + objectiveId + '/revisions/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, rid),
    );
    const expected = objectiveRevisionEntityOf(
        storedDoc(rid, fields),
    );
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    const derived = await deriveObjectiveRevisions(
        db, ORGANIZATION, objectiveId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + objectiveId
            + '/revisions/',
        token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});

test('stored PUT body equals scoreEntityOf (baseline)',
async () => {
    const { db, token } = await freshDb();
    const projectId = generateIdentifier();
    const sid = generateIdentifier();
    const fields = {
        project_id: projectId,
        objective_id: generateIdentifier(),
        score: 3,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-baseline-scores/' + sid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/projects/' + projectId
        + '/objective-baseline-scores/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, sid),
    );
    const expected = scoreEntityOf(storedDoc(sid, fields));
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveBaselineScores(
        db, ORGANIZATION, projectId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-baseline-scores/',
        token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});

test('stored PUT body equals scoreEntityOf (actual)',
async () => {
    const { db, token } = await freshDb();
    const projectId = generateIdentifier();
    const sid = generateIdentifier();
    const fields = {
        project_id: projectId,
        objective_id: generateIdentifier(),
        score: 4,
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: AT,
    };
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-actual-scores/' + sid,
        token, fields,
    ));
    assert.equal(put.status, 201);
    const prefix = '/organizations/' + ORGANIZATION
        + '/projects/' + projectId
        + '/objective-actual-scores/';
    const stored = JSON.parse(
        await storedPutBodyText(db, prefix, sid),
    );
    const expected = scoreEntityOf(storedDoc(sid, fields));
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(stored, await put.json());
    const derived = await deriveActualScores(
        db, ORGANIZATION, projectId,
    );
    assert.deepEqual(derived, [expected]);
    const got = await handleRequest(db, req(
        'GET',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + projectId
        + '/objective-actual-scores/',
        token,
    ));
    assert.equal(got.status, 200);
    assert.deepEqual(await got.json(), [stored]);
});
