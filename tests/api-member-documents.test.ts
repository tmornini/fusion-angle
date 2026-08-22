import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT, handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
} from '../api/db-memory.ts';
import {
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { ValidationError, nowUtc } from '../api/types.ts';
import {
    validateMemberDocumentBody,
    validateMemberEntity,
    validateAiMemberDocumentBody,
    validateAIMemberEntity,
    validateHumanMemberDocumentBody,
    validateHumanMemberEntity,
} from '../api/validators.ts';
import {
    postMemberDocumentOp,
    postAiMemberDocumentOp,
    postHumanMemberDocumentOp,
} from '../api/routes.ts';
import {
    formWritePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
} from '../api/document-family.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Members are a lifecycle-trio family (states-address
// retirement): PUT /members/:id carries {type} plus the trio
// (state/state_at/state_event_id). The old FREEZE-at-genesis
// refutation is RETIRED — its premise (a competing states/:id
// log) died with the address; documentLifecycleEvents' echo
// dedup by state_event_id is what keeps a re-put from minting
// a phantom transition.
// human-members/:id has NO live PUT route (the first registered
// family without one), so its op/validator/wiring are exercised
// below-gate only, never through PUT().

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';

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

function memberEntityFields(type: 'human' | 'ai' | 'system'
= 'human') {
    return { type };
}

function memberFields(
    type: 'human' | 'ai' | 'system' = 'human',
    state = 'active',
    stateAt = AT,
    stateEventId = generateIdentifier(),
) {
    return {
        ...memberEntityFields(type),
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    };
}

function aiMemberFields() {
    return {
        name: 'Claude',
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

function humanMemberFields() {
    return {
        title: 'Engineer',
        department: 'Product',
        strengths: [],
        team_dimensions: {},
    };
}

// -- 1. validators: accept + the label mandate + missing keys --

test('validateMemberDocumentBody accepts type plus the'
+ ' lifecycle trio', () => {
    const fields = memberFields();
    const doc = validateMemberDocumentBody(fields);
    assert.deepEqual(doc.entity, memberEntityFields());
    assert.equal(doc.state, 'active');
    assert.equal(doc.state_at, AT);
    assert.equal(doc.state_event_id, fields.state_event_id);
});

test('validateMemberDocumentBody rejects a stray key with the'
+ ' byte-identical message validateMemberEntity produces for'
+ ' the SAME violation (the label mandate)', () => {
    // Entity path only knows `type`; document path admits the
    // trio. Both reject an unknown key under the SAME
    // 'MemberEntity' label — compare the stray-key message
    // shape, each on a body that is otherwise valid for its
    // path.
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateMemberDocumentBody({
            ...memberFields(), bogus: 'nope',
        });
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateMemberEntity({
            ...memberEntityFields(), bogus: 'nope',
        });
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'unexpected key "bogus" for MemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateMemberDocumentBody rejects the missing type key,'
+ ' byte-identical to validateMemberEntity on both paths',
() => {
    const body: Record<string, unknown> = {};
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateMemberDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateMemberEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'missing required key "type" for MemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateMemberDocumentBody rejects a body missing the'
+ ' lifecycle trio', () => {
    assert.throws(
        () => validateMemberDocumentBody(
            memberEntityFields(),
        ),
        ValidationError,
    );
});

test('validateMemberDocumentBody rejects a state outside'
+ " ['active','pending','archived']", () => {
    assert.throws(
        () => validateMemberDocumentBody(
            memberFields(
                'human', 'deleted', AT, generateIdentifier(),
            ),
        ),
        ValidationError,
    );
});

// -- 1b. PUT members/:id wire trio ---------------------------

test('PUT members/:id is retired 404', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/members/nXdwGKWtevpvniAfAbiPFA', token, {
            type: 'human',
            state: 'active',
            state_at: nowUtc(),
            state_event_id: generateIdentifier(),
        },
    ));
    assert.equal(res.status, 404);
});

test('PUT members/:id with {type} alone is retired 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/members/nXmQQMgTtocYOzXpxijKBg', token,
        { type: 'human' },
    ));
    assert.equal(res.status, 404);
});

test('PUT members/:id outside alphabet is retired 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/members/nkcPXYSSUNrGJnmjSaxYig', token, {
            type: 'human',
            state: 'deleted',
            state_at: nowUtc(),
            state_event_id: generateIdentifier(),
        },
    ));
    assert.equal(res.status, 404);
});

test('validateAiMemberDocumentBody accepts the exact'
+ ' four-key body', () => {
    const doc = validateAiMemberDocumentBody(aiMemberFields());
    assert.deepEqual(doc.entity, aiMemberFields());
});

test('validateAiMemberDocumentBody rejects a stray key with'
+ ' the byte-identical message validateAIMemberEntity produces'
+ ' for the SAME violation (the label mandate)', () => {
    const body = { ...aiMemberFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateAiMemberDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateAIMemberEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'unexpected key "bogus" for AIMemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateAiMemberDocumentBody rejects each missing key,'
+ ' byte-identical to validateAIMemberEntity on both paths',
() => {
    for (const key of [
        'name', 'description', 'model', 'skill_focus',
    ]) {
        const body = { ...aiMemberFields() };
        delete (body as Record<string, unknown>)[key];
        let documentMessage: string | undefined;
        let entityMessage: string | undefined;
        try {
            validateAiMemberDocumentBody(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            documentMessage = (e as ValidationError).message;
        }
        try {
            validateAIMemberEntity(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            entityMessage = (e as ValidationError).message;
        }
        assert.equal(
            documentMessage,
            'missing required key "' + key
                + '" for AIMemberEntity',
        );
        assert.equal(documentMessage, entityMessage);
    }
});

test('validateAiMemberDocumentBody rejects an unknown model'
+ ' id, byte-identical to validateAIMemberEntity on both'
+ ' paths', () => {
    const body = {
        ...aiMemberFields(), model: generateIdentifier(),
    };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateAiMemberDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateAIMemberEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'model must be a known provider model id on'
            + ' AIMemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateHumanMemberDocumentBody accepts the exact'
+ ' four-key body', () => {
    const doc =
        validateHumanMemberDocumentBody(humanMemberFields());
    assert.deepEqual(doc.entity, humanMemberFields());
});

test('validateHumanMemberDocumentBody rejects a stray key with'
+ ' the byte-identical message validateHumanMemberEntity'
+ ' produces for the SAME violation (the label mandate)', () => {
    const body = { ...humanMemberFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateHumanMemberDocumentBody(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateHumanMemberEntity(body);
    } catch (e) {
        assert.ok(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assert.equal(
        documentMessage,
        'unexpected key "bogus" for HumanMemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateHumanMemberDocumentBody rejects each missing'
+ ' key, byte-identical to validateHumanMemberEntity on both'
+ ' paths', () => {
    for (const key of [
        'title', 'department', 'strengths', 'team_dimensions',
    ]) {
        const body = { ...humanMemberFields() };
        delete (body as Record<string, unknown>)[key];
        let documentMessage: string | undefined;
        let entityMessage: string | undefined;
        try {
            validateHumanMemberDocumentBody(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            documentMessage = (e as ValidationError).message;
        }
        try {
            validateHumanMemberEntity(body);
        } catch (e) {
            assert.ok(e instanceof ValidationError);
            entityMessage = (e as ValidationError).message;
        }
        assert.equal(
            documentMessage,
            'missing required key "' + key
                + '" for HumanMemberEntity',
        );
        assert.equal(documentMessage, entityMessage);
    }
});

// -- 2. the ops (below-gate, MemoryDbAdapter) ------------------

test('postMemberDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = memberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/members/nVpWUxfKrqvVXWgWENWhbA',
        routePattern: 'members/:id',
        routeSegments: ['members', ':id'],
        pathSegments: ['members', 'nVpWUxfKrqvVXWgWENWhbA'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    // Phase Final Task 2: members ROW half stripped —
    // op returns the reconstructed entity; only pairs land.
    // Mid-stage: body still includes the trio (Task 6 may
    // thin the op return to entity fields alone).
    const written = await postMemberDocumentOp(
        db, 'nVpWUxfKrqvVXWgWENWhbA', body, 'XXZruirZyAOoRpNxaDnpSA', pair,
    );
    assert.deepEqual(written, body);
    // Phase Final Stage B: roster tables retired.
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

test('postAiMemberDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped)',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = aiMemberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/ai-members/VLoTvOKjXoNVDjLLBotQXA',
        routePattern: 'ai-members/:id',
        routeSegments: ['ai-members', ':id'],
        pathSegments: ['ai-members', 'VLoTvOKjXoNVDjLLBotQXA'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    const written = await postAiMemberDocumentOp(
        db, 'VLoTvOKjXoNVDjLLBotQXA', body, 'XXZruirZyAOoRpNxaDnpSA', pair,
    );
    assert.deepEqual(written, body);
    // Phase Final Stage B: roster tables retired.
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

test('postHumanMemberDocumentOp writes exactly the pair and'
+ ' reconstructs the entity return (row half stripped;'
+ ' below-gate only — no live PUT route)', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const body = humanMemberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/human-members/fVrMeaOxbnDcSKMPwtIEZg',
        routePattern: 'human-members/:id',
        routeSegments: ['human-members', ':id'],
        pathSegments: ['human-members', 'fVrMeaOxbnDcSKMPwtIEZg'],
        headerFields: [], body,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    const written = await postHumanMemberDocumentOp(
        db, 'fVrMeaOxbnDcSKMPwtIEZg', body, 'XXZruirZyAOoRpNxaDnpSA', pair,
    );
    assert.deepEqual(written, body);
    // Phase Final Stage B: roster tables retired.
    assert.equal((await db.pairs.getAll()).length, 1);
    assert.equal((await db.pairs.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) —
// LIVE routes only: members/:id and ai-members/:id. No
// equivalent exists for human-members/:id — it has no live PUT
// to resend against. ----------------------------------------

test('a PUT resend to retired members/:id is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await assert.rejects(
        () => PUT(
            db, 'members/' + generateIdentifier(), memberFields(),
            DEV_TOKEN,
        ),
        /Not found/,
    );
});

test('a PUT resend to retired ai-members/:id is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await assert.rejects(
        () => PUT(
            db, 'ai-members/' + generateIdentifier(),
            aiMemberFields(), DEV_TOKEN,
        ),
        /Not found/,
    );
});

test('leftover roster families have no document wiring',
() => {
    for (const family of [
        'members', 'ai-members', 'human-members',
        'memberships',
    ]) {
        assert.equal(
            documentFamilyWiring(family), undefined,
            family,
        );
    }
});

test('stored PUT body members/:id route is retired',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const id = generateIdentifier();
    const at = '2026-01-01T00:00:00.000000Z';
    const ev = generateIdentifier();
    const body = memberFields('human', 'active', at, ev);
    const put = await handleRequest(
        db, req('PUT', '/members/' + id, token, body),
    );
    assert.equal(put.status, 404);
});

test('stored PUT body equals aiMemberDocumentEntityOf'
+ ' route is retired',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const body = aiMemberFields();
    const put = await handleRequest(
        db, req('PUT', '/ai-members/' + id, DEV_TOKEN, body),
    );
    assert.equal(put.status, 404);
});

test('a PUT to retired human-members/:id is 404',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const put = await handleRequest(
        db,
        req(
            'PUT',
            '/human-members/fWFpBifFNXqlKbbxpCUcDw',
            DEV_TOKEN,
            humanMemberFields(),
        ),
    );
    assert.equal(put.status, 404);
});
