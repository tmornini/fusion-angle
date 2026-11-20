import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import type { DbAdapter } from '../api/db.ts';
import { DEFAULT_ATTRIBUTE_ACL_ROLES } from
    '../shared/types.ts';
import { apiRequest } from './http-fixtures.ts';

async function putAttribute(
    db: DbAdapter,
    token: string,
    path: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path,
        token,
        body,
    }));
    assertStrictEquals(put.status, 201);
}

// A writable text attribute named Title. The path is
// the caller's attribute document.
export async function seedWritableTextAttr(
    db: DbAdapter,
    token: string,
    path: string,
): Promise<void> {
    await putAttribute(db, token, path, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

// Title, writable by the default roles, then Secret,
// readable and writable by an organization admin only.
export async function seedPublicAndSecretAttrs(
    db: DbAdapter,
    token: string,
    publicPath: string,
    secretPath: string,
): Promise<void> {
    await seedWritableTextAttr(db, token, publicPath);
    await putAttribute(db, token, secretPath, {
        name: 'Secret',
        attribute_type: 'text',
        sort_order: 1,
        options: [],
        constraints: [],
        read_roles: ['admin'],
        write_roles: ['admin'],
    });
}
