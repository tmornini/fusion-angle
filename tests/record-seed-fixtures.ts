import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEFAULT_ATTRIBUTE_ACL_ROLES } from
    '../shared/types.ts';
import { apiRequest } from './http-fixtures.ts';

// Attribute and flow-type seeds the instance suites
// copied. Each suite still passes its own ids.

async function putAttribute(
    db: MemoryDbAdapter,
    token: string,
    attrs: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: attrs + attrId,
        token,
        body,
    }));
    assertStrictEquals(put.status, 201);
}

export async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
    attrs: string,
    attrId: string,
): Promise<void> {
    await putAttribute(db, token, attrs, attrId, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

export async function seedWritableTextAttr(
    db: MemoryDbAdapter,
    token: string,
    attrs: string,
    attrId: string,
): Promise<void> {
    await seedAttribute(db, token, attrs, attrId);
}

export async function seedPublicAndSecretAttrs(
    db: MemoryDbAdapter,
    token: string,
    attrs: string,
    publicId: string,
    secretId: string,
): Promise<void> {
    await seedAttribute(db, token, attrs, publicId);
    await putAttribute(db, token, attrs, secretId, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
    });
}

export async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
    flowId: string,
    frId: string,
    typeId: string,
    at: string,
): Promise<void> {
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + flowId + '/records/' + frId,
        token,
        body: {
            id: frId,
            flow_id: flowId,
            record_id: typeId,
            at,
        },
    }));
    assertStrictEquals(put.status, 201);
}
