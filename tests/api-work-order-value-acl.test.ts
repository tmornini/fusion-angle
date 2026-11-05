import {
    assert,
    assertStrictEquals,
} from '@std/assert';
import { generateIdentifier } from '../shared/identifier.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    IF_MATCH_HEADER,
    IF_NONE_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import { apiRequest } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';

// A work order's events record the values each transition
// set. Every read of a work order serves those values
// under the attribute read rule the instance GETs keep,
// so a value hidden on the record is hidden here too.

const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const ADMIN_IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';
const MEMBER_IDENTITY = 'nkgaOHZISTQrILTfPThWCA';
const FLOW_ID = generateIdentifier();
const WO_ID = generateIdentifier();
const TYPE_ID = generateIdentifier();
const ATTR_OPEN = generateIdentifier();
const ATTR_HIDDEN = generateIdentifier();
const INSTANCE_ID = generateIdentifier();
const FR_ID = generateIdentifier();
const NODE_CREATE = generateIdentifier();
const NODE_NEXT = generateIdentifier();
const HIDDEN_VALUE = 'classified-salary-90000';

const ORGANIZATION_PATH = '/organizations/' + ORGANIZATION;
const TYPE_DETAIL =
    ORGANIZATION_PATH + '/record-types/' + TYPE_ID;
const INSTANCE_DETAIL =
    TYPE_DETAIL + '/instances/' + INSTANCE_ID;
const WORK_ORDERS = ORGANIZATION_PATH + '/work-orders/';
const WORK_ORDER = WORK_ORDERS + WO_ID;

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

async function created(
    db: MemoryDbAdapter,
    request: Request,
): Promise<Response> {
    const res = await handleRequest(db, request);
    assert(
        res.status === 200 || res.status === 201,
        request.method + ' ' + request.url
            + ' answered ' + res.status,
    );
    return res;
}

async function etagOf(
    db: MemoryDbAdapter,
    path: string,
    token: string,
): Promise<string> {
    const res = await handleRequest(db, req('GET', path, token));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    return res.headers.get('ETag')!;
}

async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
    id: string,
    name: string,
    readRoles: readonly string[],
): Promise<void> {
    await (await created(db, req(
        'PUT', TYPE_DETAIL + '/attributes/' + id, token, {
            name,
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...readRoles],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ))).body?.cancel();
}

// An admin moves a bound work order, setting a value only
// an admin may read.
async function seededWithHiddenValue(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedSeat(db, ORGANIZATION, MEMBER_IDENTITY, 'member', AT);
    const adminToken = await organizationToken(
        ADMIN_IDENTITY, ORGANIZATION,
    );
    const memberToken = await organizationToken(
        MEMBER_IDENTITY, ORGANIZATION,
    );
    await (await created(db, req(
        'POST', ORGANIZATION_PATH + '/flows/', adminToken, {
            id: FLOW_ID,
            flow: {
                name: 'Acl Flow',
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
    ))).body?.cancel();
    await seedCreatedWorkOrder(db, {
        organization: ORGANIZATION,
        id: WO_ID,
        fields: {
            display_id: 'acl1',
            flow_graph: {
                name: 'Acl Flow',
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [],
                edges: [],
            },
            position: 1,
        },
        flowId: FLOW_ID,
        births: [NODE_CREATE, NODE_CREATE],
        at: AT,
        token: adminToken,
        claim: 'released',
    });
    await (await created(db, req(
        'PUT', TYPE_DETAIL, adminToken, {
            name: 'Acl Type',
            description: '',
            position: 1,
            state: 'active',
        },
    ))).body?.cancel();
    await seedAttribute(
        db, adminToken, ATTR_OPEN, 'Title',
        DEFAULT_ATTRIBUTE_ACL_ROLES,
    );
    await seedAttribute(
        db, adminToken, ATTR_HIDDEN, 'Salary', ['admin'],
    );
    const instance = await created(db, req(
        'PATCH', INSTANCE_DETAIL, adminToken,
        { set: [{ attribute_id: ATTR_OPEN, value: 'Hello' }] },
        { [IF_NONE_MATCH_HEADER]: '*' },
    ));
    await instance.body?.cancel();
    const instanceEtag = instance.headers.get('ETag')!;
    await (await created(db, req(
        'PUT',
        ORGANIZATION_PATH + '/flows/' + FLOW_ID
            + '/records/' + FR_ID,
        adminToken,
        {
            id: FR_ID,
            flow_id: FLOW_ID,
            record_id: TYPE_ID,
            at: AT,
        },
    ))).body?.cancel();
    await (await created(db, req(
        'PUT', WORK_ORDER + '/binding', adminToken,
        { instance_id: INSTANCE_ID, record_type_id: TYPE_ID },
        {
            [IF_MATCH_HEADER]:
                await etagOf(db, WORK_ORDER, adminToken),
        },
    ))).body?.cancel();
    await (await created(db, req(
        'POST', WORK_ORDER + '/transition', adminToken,
        {
            transitionEventId: 'te-hidden',
            targetState: NODE_NEXT,
            release: null,
            transitionAt: nowUtc(),
            instance_id: INSTANCE_ID,
            record_type_id: TYPE_ID,
            set: [
                { attribute_id: ATTR_OPEN, value: 'Visible' },
                { attribute_id: ATTR_HIDDEN, value: HIDDEN_VALUE },
            ],
        },
        {
            [IF_MATCH_HEADER]:
                await etagOf(db, WORK_ORDER, adminToken)
                + ', ' + instanceEtag,
        },
    ))).body?.cancel();
    return { db, adminToken, memberToken };
}

async function bodyText(
    db: MemoryDbAdapter,
    path: string,
    token: string,
): Promise<string> {
    const res = await handleRequest(db, req('GET', path, token));
    assertStrictEquals(res.status, 200);
    return await res.text();
}

for (const [label, path] of [
    ['the work order', WORK_ORDER],
    ['the work-orders collection', WORK_ORDERS],
    ['the work order versions', WORK_ORDER + '/versions/'],
] as const) {
    Deno.test('a member reading ' + label
        + ' sees no value it may not read', async () => {
        const { db, memberToken } = await seededWithHiddenValue();
        const text = await bodyText(db, path, memberToken);
        assert(text.includes('Visible'), text);
        assert(!text.includes(HIDDEN_VALUE), text);
        assert(!text.includes(ATTR_HIDDEN), text);
    });

    Deno.test('an admin reading ' + label
        + ' sees every value', async () => {
        const { db, adminToken } = await seededWithHiddenValue();
        const text = await bodyText(db, path, adminToken);
        assert(text.includes(HIDDEN_VALUE), text);
    });
}

Deno.test('a member reading the transition version sees'
    + ' no value it may not read', async () => {
    const {
        db, adminToken, memberToken,
    } = await seededWithHiddenValue();
    const tag = (await etagOf(db, WORK_ORDER, adminToken))
        .replaceAll('"', '');
    const path = WORK_ORDER + '/versions/' + tag;
    const member = await bodyText(db, path, memberToken);
    assert(member.includes('Visible'), member);
    assert(!member.includes(HIDDEN_VALUE), member);
    const admin = await bodyText(db, path, adminToken);
    assert(admin.includes(HIDDEN_VALUE), admin);
});

// A write that changes nothing answers the head it found,
// and that head's events are the hidden-value transition's.
async function noOpAnswerText(
    db: MemoryDbAdapter,
    request: (tag: string) => Request,
    tagToken: string,
): Promise<string> {
    const res = await handleRequest(
        db, request(await etagOf(db, WORK_ORDER, tagToken)),
    );
    assertStrictEquals(res.status, 200);
    return await res.text();
}

for (const [label, request] of [
    ['a release with no live claim', (token: string) =>
        (tag: string) => req(
            'DELETE', WORK_ORDER + '/claim', token, undefined,
            { [IF_MATCH_HEADER]: tag },
        )],
    ['a bind to the bound instance', (token: string) =>
        (tag: string) => req(
            'PUT', WORK_ORDER + '/binding', token,
            {
                instance_id: INSTANCE_ID,
                record_type_id: TYPE_ID,
            },
            { [IF_MATCH_HEADER]: tag },
        )],
    ['a PUT of unchanged fields', (token: string) =>
        (tag: string) => req(
            'PUT', WORK_ORDER, token,
            {
                display_id: 'acl1',
                flow_graph: {
                    name: 'Acl Flow',
                    lockTimeout: DEFAULT_LOCK_TIMEOUT,
                    nodes: [],
                    edges: [],
                },
                position: 1,
            },
            { [IF_MATCH_HEADER]: tag },
        )],
] as const) {
    Deno.test('a member answered by ' + label
        + ' sees no value it may not read', async () => {
        const { db, memberToken } = await seededWithHiddenValue();
        const text = await noOpAnswerText(
            db, request(memberToken), memberToken,
        );
        assert(text.includes('Visible'), text);
        assert(!text.includes(HIDDEN_VALUE), text);
    });
}

// The same attribute id under another record type is
// another attribute; its rule never judges this work
// order's values.
Deno.test('a readable namesake on another record type'
    + ' reveals no hidden value', async () => {
    const {
        db, adminToken, memberToken,
    } = await seededWithHiddenValue();
    const namesakeType = ORGANIZATION_PATH + '/record-types/'
        + generateIdentifier();
    await (await created(db, req(
        'PUT', namesakeType, adminToken, {
            name: 'Namesake Type',
            description: '',
            position: 2,
            state: 'active',
        },
    ))).body?.cancel();
    await (await created(db, req(
        'PUT', namesakeType + '/attributes/' + ATTR_HIDDEN,
        adminToken,
        {
            name: 'Namesake',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ))).body?.cancel();
    for (const path of [WORK_ORDER, WORK_ORDERS]) {
        const text = await bodyText(db, path, memberToken);
        assert(text.includes('Visible'), text);
        assert(!text.includes(HIDDEN_VALUE), text);
    }
});
