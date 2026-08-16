import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// Task 20 RESTRICT activation — type DELETE legs now that
// instances exist. Tombstoned instances do not block;
// live heads do (voice: N instance(s)).

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const TYPE_ID = 'rt-restrict-1';
const ATTR_ID = 'attr-restrict-1';
const INSTANCE_ID = 'inst-restrict-1';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes';
const INSTANCES = TYPE_DETAIL + '/instances';
const INSTANCE_DETAIL = INSTANCES + '/' + INSTANCE_ID;

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers: extraHeaders,
        operationId: TEST_OPERATION_ID,
    });
}

async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );
}

async function adminDb(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedMembershipPair(db, 'm-member1', {
        organization_id: ORGANIZATION,
        identity_id: 'member1',
        type: 'member',
        at: AT,
    });
    return {
        db,
        adminToken: await organizationToken(
            'current', ORGANIZATION,
        ),
        memberToken: await organizationToken(
            'member1', ORGANIZATION,
        ),
    };
}

function typeBody(): Record<string, unknown> {
    return {
        name: 'Rental',
        description: 'Rental desc',
        position: 1,
        state: 'active',
        state_at: AT,
        state_event_id: TYPE_ID + '-genesis',
    };
}

async function putLiveType(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, adminToken, typeBody(),
    ));
    assert.equal(put.status, 201);
}

async function seedWritableTextAttr(
    db: MemoryDbAdapter,
    adminToken: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + '/' + ATTR_ID, adminToken, {
            name: 'Title',
            attribute_type: 'text',
            sort_order: 0,
            options: [],
            constraints: [],
            read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        },
    ));
    assert.equal(put.status, 201);
}

async function putLiveInstance(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, token, {
            set: [
                {
                    attribute_id: ATTR_ID,
                    value: 'live',
                },
            ],
        },
    ));
    assert.equal(put.status, 201);
}

test('type DELETE with one live instance → 409 naming '
+ '1 instance(s)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putLiveInstance(db, memberToken);
    const del = await handleRequest(db, req(
        'DELETE', TYPE_DETAIL, adminToken,
    ));
    assert.equal(del.status, 409);
    const body = await del.json() as { error: string };
    assert.equal(
        body.error,
        'record type ' + TYPE_ID
            + ' is referenced by 1 instance(s)',
    );
    const still = await handleRequest(db, req(
        'GET', TYPE_DETAIL, adminToken,
    ));
    assert.equal(still.status, 200);
});

test('type DELETE after instance DELETE → 204 '
+ '(tombstoned instances do not block)',
async () => {
    const { db, adminToken, memberToken } =
        await adminDb();
    await putLiveType(db, adminToken);
    await seedWritableTextAttr(db, adminToken);
    await putLiveInstance(db, memberToken);
    const instDel = await handleRequest(db, req(
        'DELETE', INSTANCE_DETAIL, memberToken,
    ));
    assert.equal(instDel.status, 204);
    const typeDel = await handleRequest(db, req(
        'DELETE', TYPE_DETAIL, adminToken,
    ));
    assert.equal(typeDel.status, 204);
    const detail = await handleRequest(db, req(
        'GET', TYPE_DETAIL, adminToken,
    ));
    assert.equal(detail.status, 404);
});
