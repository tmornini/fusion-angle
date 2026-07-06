import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PUT } from '../api/api.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { ValidationError } from '../api/types.ts';
import { EntityNotFoundError } from '../api/db.ts';
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
    appendMessagePair,
} from '../api/message-pair.ts';
import {
    documentFamilyWiring,
    documentGetHandler,
} from '../api/document-family.ts';

// Phase 8 Task 3 (ninth/tenth/eleventh families, the FIRST
// global-plane families — organizationNested:false — and the
// FIRST 'stateless' bucket sharing REAL states events): PUT
// /members/:id and PUT /ai-members/:id take the entity's OWN
// fields only, no lifecycle trio, since the shared member id
// already receives a genesis states event at create and
// archive/reactivate via PUT states/:id — a document-address
// trio would FREEZE that lifecycle at genesis forever.
// human-members/:id has NO live PUT route (the first registered
// family without one), so its op/validator/wiring are exercised
// below-gate only, never through PUT().

function memberFields() {
    return { type: 'human' as const };
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
        strengths: '[]',
        team_dimensions: '{}',
    };
}

// -- 1. validators: accept + the label mandate + missing keys --

test('validateMemberDocumentBody accepts the exact one-key'
+ ' body', () => {
    const doc = validateMemberDocumentBody(memberFields());
    assert.deepEqual(doc.entity, memberFields());
});

test('validateMemberDocumentBody rejects a stray key with the'
+ ' byte-identical message validateMemberEntity produces for'
+ ' the SAME violation (the label mandate)', () => {
    const body = { ...memberFields(), bogus: 'nope' };
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
        'unexpected key "bogus" for MemberEntity',
    );
    assert.equal(documentMessage, entityMessage);
});

test('validateMemberDocumentBody rejects the missing key,'
+ ' byte-identical to validateMemberEntity on both paths', () => {
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
    const body = { ...aiMemberFields(), model: 'bogus-model' };
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

test('postMemberDocumentOp writes exactly the members row and'
+ ' the pair', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = memberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/members/mem-doc-op-1',
        routePattern: 'members/:id',
        routeSegments: ['members', ':id'],
        pathSegments: ['members', 'mem-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await postMemberDocumentOp(
        db, 'mem-doc-op-1', body, 'current', pair,
    );
    const row = await db.members.getById('mem-doc-op-1');
    assert.deepEqual(row, { id: 'mem-doc-op-1', ...body });
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('postAiMemberDocumentOp writes exactly the ai_members row'
+ ' and the pair', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = aiMemberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/ai-members/ai-doc-op-1',
        routePattern: 'ai-members/:id',
        routeSegments: ['ai-members', ':id'],
        pathSegments: ['ai-members', 'ai-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await postAiMemberDocumentOp(
        db, 'ai-doc-op-1', body, 'current', pair,
    );
    const row = await db.aiMembers.getById('ai-doc-op-1');
    assert.deepEqual(row, { id: 'ai-doc-op-1', ...body });
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('postHumanMemberDocumentOp writes exactly the'
+ ' human_members row and the pair (below-gate only — no live'
+ ' PUT route dispatches here)', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    const body = humanMemberFields();
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/human-members/hm-doc-op-1',
        routePattern: 'human-members/:id',
        routeSegments: ['human-members', ':id'],
        pathSegments: ['human-members', 'hm-doc-op-1'],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt: '2026-01-01T00:00:00.000000Z',
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        headPairId: undefined,
    });
    await postHumanMemberDocumentOp(
        db, 'hm-doc-op-1', body, 'current', pair,
    );
    const row = await db.humanMembers.getById('hm-doc-op-1');
    assert.deepEqual(row, { id: 'hm-doc-op-1', ...body });
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 3. byte-identical resend (the E6 fast-path sibling pin) —
// LIVE routes only: members/:id and ai-members/:id. No
// equivalent exists for human-members/:id — it has no live PUT
// to resend against. ----------------------------------------

test('a byte-identical PUT resend to members/:id converges to'
+ ' one stored request/response pair', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const body = memberFields();
    const first = await PUT(
        db, 'members/mem-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'members/mem-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

test('a byte-identical PUT resend to ai-members/:id converges'
+ ' to one stored request/response pair', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const body = aiMemberFields();
    const first = await PUT(
        db, 'ai-members/ai-resend-1', body, DEV_TOKEN,
    );
    const second = await PUT(
        db, 'ai-members/ai-resend-1', body, DEV_TOKEN,
    );
    assert.deepEqual(first, second);
    assert.equal((await db.requests.getAll()).length, 1);
    assert.equal((await db.responses.getAll()).length, 1);
});

// -- 4. below-route via the generic handlers (the drift-file
// mirror idiom, against the REAL registered wiring rows) — a
// PUT chain Supersedes-chains and the head derives the LATEST
// body; a DELETE head derives to absence. No states event is
// ever posted in any of these tests — the stateless arm's ONLY
// tombstone signal is the DELETE-method head itself (derive-
// documents.ts), so a clean pass here is itself proof no
// lifecycle walk ever runs for any of the three families,
// exactly as the memberships precedent established. -----------

async function putDocumentPair(
    db: MemoryDbAdapter,
    family: string,
    id: string,
    body: Record<string, unknown>,
    requestAt: string,
    headPairId?: string,
): Promise<string> {
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/' + family + '/' + id,
        routePattern: family + '/:id',
        routeSegments: [family, ':id'],
        pathSegments: [family, id],
        headerFields: [], body,
        requesterIdentityId: 'current',
        requestAt,
        organization: undefined,
        responseStatus: 200, responseBody: undefined,
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
    return pair.id;
}

async function deleteDocumentPair(
    db: MemoryDbAdapter,
    family: string,
    id: string,
    requestAt: string,
    headPairId?: string,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: '/' + family + '/' + id,
        routePattern: family + '/:id',
        routeSegments: [family, ':id'],
        pathSegments: [family, id],
        headerFields: [], body: {},
        requesterIdentityId: 'current',
        requestAt,
        organization: undefined,
        responseStatus: 204, responseBody: undefined,
        headPairId,
    });
    await db.transaction(
        ['requests', 'responses'],
        (view) => appendMessagePair(view, pair),
    );
}

const FAMILY_CASES: readonly {
    family: string;
    notFoundTable: string;
    fields: () => Record<string, unknown>;
    revise: (
        fields: Record<string, unknown>,
    ) => Record<string, unknown>;
}[] = [
    {
        family: 'members',
        notFoundTable: 'members',
        fields: memberFields,
        revise: () => ({ type: 'ai' }),
    },
    {
        family: 'ai-members',
        notFoundTable: 'ai_members',
        fields: aiMemberFields,
        revise: (f) => ({ ...f, description: 'revised' }),
    },
    {
        family: 'human-members',
        notFoundTable: 'human_members',
        fields: humanMemberFields,
        revise: (f) => ({ ...f, department: 'Revised' }),
    },
];

for (const {
    family, notFoundTable, fields, revise,
} of FAMILY_CASES) {
    test('a PUT chain Supersedes-chains and the head derives'
    + ' the LATEST body, through the generic document handlers'
    + ' (' + family + ')', async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        const wiring = documentFamilyWiring(family)!;
        const first = fields();
        const firstId = await putDocumentPair(
            db, family, family + '-chain-1', first,
            '2026-02-01T00:00:00.000000Z',
        );
        const headAfterFirst = await documentGetHandler(wiring)(
            db, [family + '-chain-1'], 'current', 'ignored',
        );
        assert.deepEqual(headAfterFirst, {
            id: family + '-chain-1', ...first,
        });

        const second = revise(first);
        const secondId = await putDocumentPair(
            db, family, family + '-chain-1', second,
            '2026-02-02T00:00:00.000000Z', firstId,
        );
        const secondResponse =
            await db.responses.getById(secondId);
        assert.equal(secondResponse.supersedes, firstId);

        const headAfterSecond = await documentGetHandler(wiring)(
            db, [family + '-chain-1'], 'current', 'ignored',
        );
        assert.deepEqual(headAfterSecond, {
            id: family + '-chain-1', ...second,
        });
    });

    test('a DELETE-head derives absent through the generic'
    + ' document handlers, carrying notFoundTable (never the'
    + ' entity-store table name coincidence) (' + family + ')',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        const wiring = documentFamilyWiring(family)!;
        await putDocumentPair(
            db, family, family + '-del-1', fields(),
            '2026-02-01T00:00:00.000000Z',
        );
        await deleteDocumentPair(
            db, family, family + '-del-1',
            '2026-02-02T00:00:00.000000Z',
        );
        await assert.rejects(
            documentGetHandler(wiring)(
                db, [family + '-del-1'], 'current', 'ignored',
            ),
            (error: unknown) => {
                assert.ok(error instanceof EntityNotFoundError);
                assert.equal(
                    (error as EntityNotFoundError).table,
                    notFoundTable,
                );
                assert.equal(
                    (error as EntityNotFoundError).message,
                    'Not found: ' + notFoundTable + '/'
                        + family + '-del-1',
                );
                return true;
            },
        );
    });
}
