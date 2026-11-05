import { assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../../api/db.ts';
import { handleRequest } from '../../api/api.ts';
import type { Id } from '../../shared/types.ts';
import { DEFAULT_ATTRIBUTE_ACL_ROLES } from
    '../../shared/types.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { apiRequest } from '../http-fixtures.ts';

// A work order's event values are served under their
// attributes' read rule, so a value a test records names
// an attribute that exists. This lands one live record
// type holding a text attribute, readable by every member,
// for each id; `token` holds admin in `organization`.
export async function seedMemberReadableAttributes(
    db: DbAdapter,
    organization: Id,
    token: string,
    attributeIds: readonly Id[],
): Promise<void> {
    const type = '/organizations/' + organization
        + '/record-types/' + generateIdentifier();
    const created = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: type,
        token,
        body: {
            name: 'Recorded values',
            description: '',
            position: 1,
            state: 'active',
        },
    }));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    for (const [order, id] of attributeIds.entries()) {
        const attribute = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: type + '/attributes/' + id,
            token,
            body: {
                name: 'Recorded ' + order,
                attribute_type: 'text',
                sort_order: order,
                options: [],
                constraints: [],
                read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
                write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
            },
        }));
        assertStrictEquals(attribute.status, 201);
        await attribute.body?.cancel();
    }
}
