import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { seededMockDb } from './mock-seed.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    assertPartIsDocumentGet,
    assertPartsAreHeads,
    partsOf,
} from './http-fixtures.ts';
import {
    credentialReader,
    instanceReader,
    loadAttributeSchemaById,
} from '../api/routes.ts';
import type { Reader } from '../api/served-response.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { ORGANIZATION_TWO } from '../api/mock-data/seed-constants.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';

const STREAM: readonly [string, (id: string) => string][] = [
    ['/identities/', (id) => '/identities/' + id],
    ['/ai-agents/', (id) => '/ai-agents/' + id],
    ...['ideas', 'projects', 'work-orders', 'objectives'].map(
        (family) => [
            '/organizations/' + STARK + '/' + family + '/',
            (id: string) => '/organizations/' + STARK + '/'
                + family + '/' + id,
        ] as [string, (id: string) => string],
    ),
];

for (const [collection, documentOf] of STREAM) {
    Deno.test(collection + ' serves its heads as parts',
    async () => {
        const db = await seededMockDb();
        const token = await organizationToken();
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection, token,
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<{ id: string }>(got);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        const first = parts[0]!;
        await assertPartIsDocumentGet(
            db, token, first, documentOf(first.body().toValue().id),
        );
    });
}

Deno.test('an empty collection answers 204', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + STARK + '/ideas/',
        token,
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
    assert(got.headers.get('request-id') !== null);
});

const ME = 'XXZruirZyAOoRpNxaDnpSA';
const AT = '2026-01-01T00:00:00.000000Z';

// The seed writes no token or provider of the admin's, so
// each collection gets two documents written through the
// gate before it is read.
async function identityCollectionsDb(token: string) {
    const db = await seededMockDb();
    const chain = generateIdentifier();
    for (const jti of [generateIdentifier(), generateIdentifier()]) {
        const put = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + ME + '/tokens/' + jti,
            token,
            body: {
                jti, identity_id: ME, action: 'issued',
                chain_id: chain, at: AT,
            },
        }));
        assert(put.ok, 'token PUT ' + put.status);
        await put.body?.cancel();
    }
    for (const provider of ['google', 'github']) {
        const put = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + ME + '/providers/'
                + generateIdentifier(),
            token,
            body: {
                identity_id: ME, provider,
                provider_subject: 'sub-' + provider,
                action: 'linked', at: AT,
            },
        }));
        assert(put.ok, 'provider PUT ' + put.status);
        await put.body?.cancel();
    }
    return db;
}

const IDENTITY_COLLECTIONS: readonly [string, Reader][] = [
    ['credentials', credentialReader(['admin'])],
    ['tokens', { sees: 'whole' }],
    ['providers', { sees: 'whole' }],
];

for (const [family, reader] of IDENTITY_COLLECTIONS) {
    const collection = '/identities/' + ME + '/' + family + '/';
    Deno.test(collection + ' serves its heads as parts',
    async () => {
        const token = await organizationToken();
        const db = await identityCollectionsDb(token);
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection, token,
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<{ id: string }>(got);
        await assertPartsAreHeads(db, parts, reader);
        for (const part of parts) {
            await assertPartIsDocumentGet(
                db, token, part,
                collection + part.body().toValue().id,
            );
        }
    });
}

// A credential's secret reaches no reader, admins included.
Deno.test('no credential part holds its secret', async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + ME + '/credentials/',
        token: await organizationToken(),
    }));
    const parts = await partsOf(got);
    assert(parts.length > 0, 'the admin holds credentials');
    for (const part of parts) {
        assert(!part.body().toText().includes('"secret"'));
    }
});

Deno.test('an identity\'s organizations are the organizations'
    + ' it holds a live seat in', async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: 'Seated', email: id.toLowerCase() + '@example.com',
        phone: '', bio: '',
    });
    await seedSeat(db, STARK, id, 'member');
    const token = await devToken(id);
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/organizations/',
        token,
    }));
    assertStrictEquals(got.status, 200);
    const parts = await partsOf<{ id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.map((part) => part.body().toValue().id),
        [STARK],
    );
    await assertPartIsDocumentGet(
        db, await organizationToken(id), parts[0]!,
        '/organizations/' + STARK,
    );
});

Deno.test('an identity with no seat has no organizations',
async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: 'Unseated', email: id.toLowerCase() + '@example.com',
        phone: '', bio: '',
    });
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/organizations/',
        token: await devToken(id),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
});

const FLOWS = '/organizations/' + STARK + '/flows/';
// Customer Onboarding carries a record binding and 39 work
// orders; Fusion Angle Flow carries no work order.
const ONBOARDING = 'esKujtyQFYUJaVSXWwavzA';
const UNWORKED = 'GgfDbXOJUvvaCekCTcvhuw';

Deno.test(FLOWS + ' serves its heads as parts, each its'
    + ' document GET', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: FLOWS, token,
    }));
    assertStrictEquals(got.status, 200);
    assertMatch(
        got.headers.get('content-type')!,
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    assertStrictEquals(got.headers.get('etag'), null);
    const parts = await partsOf<{ id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    for (const part of parts) {
        await assertPartIsDocumentGet(
            db, token, part, FLOWS + part.body().toValue().id,
        );
    }
});

Deno.test('a state-deleted flow is no part of its collection',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const read = await handleRequest(db, apiRequest({
        method: 'GET', path: FLOWS + ONBOARDING, token,
    }));
    assertStrictEquals(read.status, 200);
    const stored = await read.json() as Record<string, unknown>;
    const { id: _id, ...body } = stored;
    const deleted = await handleRequest(db, apiRequest({
        method: 'PUT', path: FLOWS + ONBOARDING, token,
        headers: { 'if-match': read.headers.get('etag')! },
        body: {
            ...body,
            state: 'deleted', state_at: AT,
            state_event_id: generateIdentifier(),
            graphDelta: {
                nodes: [], edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
            revivals: [],
        },
    }));
    assertStrictEquals(deleted.status, 200);
    await deleted.body?.cancel();
    const parts = await partsOf<{ id: string }>(
        await handleRequest(db, apiRequest({
            method: 'GET', path: FLOWS, token,
        })),
    );
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.filter((part) =>
            part.body().toValue().id === ONBOARDING),
        [],
    );
});

for (const join of ['records', 'work-orders']) {
    const collection = FLOWS + ONBOARDING + '/' + join + '/';
    Deno.test(collection + ' serves its join heads as parts',
    async () => {
        const db = await seededMockDb();
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection,
            token: await organizationToken(),
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<{ flow_id: string }>(got);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        for (const part of parts) {
            assertStrictEquals(
                part.body().toValue().flow_id, ONBOARDING,
            );
        }
    });
}

Deno.test('a flow with no work orders answers 204', async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: FLOWS + UNWORKED + '/work-orders/',
        token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});

const RECORD_TYPES = '/organizations/' + STARK + '/record-types/';
// Customer Profile carries seeded attributes.
const CUSTOMER_PROFILE = 'sJxkGGTrPegHqFbQAkXnjw';

async function putRecordType(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    state: string,
    ifMatch?: string,
): Promise<Response> {
    const put = await handleRequest(db, apiRequest({
        method: 'PUT', path: RECORD_TYPES + id, token,
        ...(ifMatch !== undefined
            ? { headers: { 'if-match': ifMatch } } : {}),
        body: {
            name: 'Rental', description: 'Rental desc',
            position: 3, state,
        },
    }));
    await put.body?.cancel();
    return put;
}

Deno.test(RECORD_TYPES + ' serves its heads as parts, each its'
    + ' document GET', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: RECORD_TYPES, token,
    }));
    assertStrictEquals(got.status, 200);
    assertMatch(
        got.headers.get('content-type')!,
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    assertStrictEquals(got.headers.get('etag'), null);
    const parts = await partsOf<{ id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    for (const part of parts) {
        await assertPartIsDocumentGet(
            db, token, part,
            RECORD_TYPES + part.body().toValue().id,
        );
    }
});

Deno.test('a state-deleted record type is no part of its'
    + ' collection', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const created = await putRecordType(db, token, id, 'active');
    assertStrictEquals(created.status, 201);
    const deleted = await putRecordType(
        db, token, id, 'deleted', created.headers.get('etag')!,
    );
    assertStrictEquals(deleted.status, 200);
    const parts = await partsOf<{ id: string }>(
        await handleRequest(db, apiRequest({
            method: 'GET', path: RECORD_TYPES, token,
        })),
    );
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.filter((part) => part.body().toValue().id === id),
        [],
    );
});

Deno.test(RECORD_TYPES + CUSTOMER_PROFILE + '/attributes/'
    + ' serves its heads as parts, each its document GET',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const attributes = RECORD_TYPES + CUSTOMER_PROFILE
        + '/attributes/';
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: attributes, token,
    }));
    assertStrictEquals(got.status, 200);
    assertMatch(
        got.headers.get('content-type')!,
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    assertStrictEquals(got.headers.get('etag'), null);
    const parts = await partsOf<{
        id: string; record_type_id: string;
    }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    for (const part of parts) {
        const attribute = part.body().toValue();
        assertStrictEquals(
            attribute.record_type_id, CUSTOMER_PROFILE,
        );
        await assertPartIsDocumentGet(
            db, token, part, attributes + attribute.id,
        );
    }
});

Deno.test('a record type with no attributes answers 204',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const created = await putRecordType(db, token, id, 'active');
    assertStrictEquals(created.status, 201);
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: RECORD_TYPES + id + '/attributes/',
        token,
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});

Deno.test('attributes under a record type never written'
    + ' answer 404', async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: RECORD_TYPES + id + '/attributes/',
        token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 404);
    assertEquals(await got.json(), {
        error: 'Not found: record_types/' + id,
    });
});

// An instance list: each part is a live head, projected by
// its reader's attribute roles as the document GET projects
// it.
const ADMIN_ONLY = generateIdentifier();
const EVERYONE = generateIdentifier();

type InstanceWire = {
    id: string;
    values: { attribute_id: string; value: string }[];
};

async function instancesDb() {
    const db = await seededMockDb();
    const token = await organizationToken();
    const typeId = generateIdentifier();
    const created = await putRecordType(
        db, token, typeId, 'active',
    );
    assertStrictEquals(created.status, 201);
    const type = RECORD_TYPES + typeId;
    for (const [id, readRoles] of [
        [EVERYONE, ['member', 'admin']],
        [ADMIN_ONLY, ['admin']],
    ] as const) {
        const put = await handleRequest(db, apiRequest({
            method: 'PUT', path: type + '/attributes/' + id,
            token,
            body: {
                name: 'Field ' + id, attribute_type: 'text',
                sort_order: 0, options: [], constraints: [],
                read_roles: [...readRoles],
                write_roles: ['admin'],
            },
        }));
        assertStrictEquals(put.status, 201);
        await put.body?.cancel();
    }
    const instances = type + '/instances/';
    const ids = [generateIdentifier(), generateIdentifier()];
    for (const id of ids) {
        const put = await handleRequest(db, apiRequest({
            method: 'PATCH', path: instances + id, token,
            headers: { 'if-none-match': '*' },
            body: {
                set: [
                    { attribute_id: EVERYONE, value: 'open' },
                    { attribute_id: ADMIN_ONLY, value: 'held' },
                ],
            },
        }));
        assertStrictEquals(put.status, 201);
        await put.body?.cancel();
    }
    const member = generateIdentifier();
    await seedSeat(db, STARK, member, 'member');
    return {
        db, token, typeId, instances, ids,
        memberToken: await organizationToken(member),
    };
}

Deno.test('an instance list serves its heads as parts, each'
    + ' projected for its reader as its document GET',
async () => {
    const { db, token, typeId, instances, ids, memberToken } =
        await instancesDb();
    const schema = await loadAttributeSchemaById(
        db, STARK, typeId,
    );
    for (const [reader, roles, sees] of [
        [token, ['admin'], [EVERYONE, ADMIN_ONLY]],
        [memberToken, ['member'], [EVERYONE]],
    ] as const) {
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: instances, token: reader,
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<InstanceWire>(got);
        await assertPartsAreHeads(
            db, parts, instanceReader(schema, roles),
        );
        assertEquals(
            parts.map((part) => part.body().toValue().id).sort(),
            [...ids].sort(),
        );
        for (const part of parts) {
            const instance = part.body().toValue();
            assertEquals(
                instance.values.map((v) => v.attribute_id).sort(),
                [...sees].sort(),
            );
            await assertPartIsDocumentGet(
                db, reader, part, instances + instance.id,
            );
        }
    }
});

Deno.test('a retired instance is no part of its list',
async () => {
    const { db, token, typeId, instances, ids } =
        await instancesDb();
    const retired = ids[0]!;
    const deleted = await handleRequest(db, apiRequest({
        method: 'DELETE', path: instances + retired, token,
    }));
    assertStrictEquals(deleted.status, 204);
    const parts = await partsOf<InstanceWire>(
        await handleRequest(db, apiRequest({
            method: 'GET', path: instances, token,
        })),
    );
    await assertPartsAreHeads(db, parts, instanceReader(
        await loadAttributeSchemaById(db, STARK, typeId),
        ['admin'],
    ));
    assertEquals(
        parts.map((part) => part.body().toValue().id),
        [ids[1]!],
    );
});

Deno.test('a record type with no instances answers 204',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const id = generateIdentifier();
    const created = await putRecordType(db, token, id, 'active');
    assertStrictEquals(created.status, 201);
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: RECORD_TYPES + id + '/instances/',
        token,
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});

const ORGANIZATION = '/organizations/' + STARK;
// The first seeded idea carries a submission; the two-flows
// project carries two flow joins, four baselines, and five
// actuals; every seeded objective carries one revision.
const SUBMITTED_IDEA = 'YvOylAxOjQcgmNmsSoVBPQ';
const TWO_FLOWS_PROJECT = 'wqGTTFdYUGnmBxWCppmkOQ';
const REVISED_OBJECTIVE = 'JobGWBxUTEBusPcVhYEKtA';
// A submitted project is scored by no one yet.
const SUBMITTED_PROJECT = 'PIfhHMLQQxTxKFDdabXbOw';

const CHILDREN: readonly [string, string, string][] = [
    [
        ORGANIZATION + '/ideas/' + SUBMITTED_IDEA + '/submissions/',
        'idea_id', SUBMITTED_IDEA,
    ],
    [
        ORGANIZATION + '/projects/' + TWO_FLOWS_PROJECT + '/flows/',
        'project_id', TWO_FLOWS_PROJECT,
    ],
    [
        ORGANIZATION + '/objectives/' + REVISED_OBJECTIVE
            + '/revisions/',
        'objective_id', REVISED_OBJECTIVE,
    ],
    [
        ORGANIZATION + '/projects/' + TWO_FLOWS_PROJECT
            + '/objective-baseline-scores/',
        'project_id', TWO_FLOWS_PROJECT,
    ],
    [
        ORGANIZATION + '/projects/' + TWO_FLOWS_PROJECT
            + '/objective-actual-scores/',
        'project_id', TWO_FLOWS_PROJECT,
    ],
];

for (const [collection, parentField, parentId] of CHILDREN) {
    Deno.test(collection + ' serves its heads as parts',
    async () => {
        const db = await seededMockDb();
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection,
            token: await organizationToken(),
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<Record<string, unknown>>(got);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        for (const part of parts) {
            assertStrictEquals(
                part.body().toValue()[parentField], parentId,
            );
        }
    });
}

Deno.test('a submitted project\'s baseline scores answer 204',
async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: ORGANIZATION + '/projects/' + SUBMITTED_PROJECT
            + '/objective-baseline-scores/',
        token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});

// The path fence admits the caller's own organization; the
// foreign objective's revisions live under another prefix.
Deno.test('a foreign objective\'s revisions answer 204',
async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + ORGANIZATION_TWO
            + '/objectives/' + REVISED_OBJECTIVE + '/revisions/',
        token: await organizationToken(ME, ORGANIZATION_TWO),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});

const MEMBERS = ORGANIZATION + '/members/';

Deno.test(MEMBERS + ' serves its seat heads as parts, each'
    + ' its document GET', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: MEMBERS, token,
    }));
    assertStrictEquals(got.status, 200);
    assertMatch(
        got.headers.get('content-type')!,
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    assertStrictEquals(got.headers.get('etag'), null);
    const parts = await partsOf<{ identity_id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    for (const part of parts) {
        await assertPartIsDocumentGet(
            db, token, part,
            MEMBERS + part.body().toValue().identity_id,
        );
    }
});

Deno.test('a removed seat is no part of its roster',
async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    await seedSeat(db, STARK, id, 'member');
    const token = await organizationToken();
    const seatedOf = async (): Promise<string[]> => {
        const parts = await partsOf<{ identity_id: string }>(
            await handleRequest(db, apiRequest({
                method: 'GET', path: MEMBERS, token,
            })),
        );
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        return parts
            .map((part) => part.body().toValue().identity_id)
            .filter((seated) => seated === id);
    };
    assertEquals(await seatedOf(), [id]);
    const removed = await handleRequest(db, apiRequest({
        method: 'DELETE', path: MEMBERS + id, token,
    }));
    assertStrictEquals(removed.status, 204);
    assertEquals(await seatedOf(), []);
});
