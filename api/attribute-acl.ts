import type { AttributeSchemaRow } from
    './record-constraints.ts';
import { ValidationError } from './types.ts';
import {
    ApiError,
    HTTP_FORBIDDEN,
} from './http-errors.ts';

// Field-level × role-aware ACL evaluation and read
// projection. Admin bypass is FENCED-org roles only
// (roles already fenced at the gate). Write asserts are
// all-or-nothing: one denied id → 403 for the whole set.
// Projection trusts RESTRICT — unknown attribute ids are
// not guarded (no internal defense).

function rolesIntersect(
    held: readonly string[],
    allowed: readonly string[],
): boolean {
    return allowed.some(
        (role) => held.includes(role),
    );
}

export function rolesCanRead(
    roles: readonly string[],
    attribute: AttributeSchemaRow,
): boolean {
    if (roles.includes('admin')) {
        return true;
    }
    return rolesIntersect(roles, attribute.readRoles);
}

export function rolesCanWrite(
    roles: readonly string[],
    attribute: AttributeSchemaRow,
): boolean {
    if (roles.includes('admin')) {
        return true;
    }
    return rolesIntersect(roles, attribute.writeRoles);
}

// Ladder: unknown attribute_id (400) before write ACL
// (403). Schema truth is member-readable — no leak.
export function assertWritableAttributeIds(
    attributeIds: readonly string[],
    attributesById: ReadonlyMap<
        string, AttributeSchemaRow
    >,
    roles: readonly string[],
): void {
    for (const id of attributeIds) {
        if (!attributesById.has(id)) {
            throw new ValidationError(
                'unknown attribute_id "' + id + '"',
            );
        }
    }
    for (const id of attributeIds) {
        const attribute = attributesById.get(id)!;
        if (!rolesCanWrite(roles, attribute)) {
            throw new ApiError(
                'forbidden: attribute '
                + id
                + ' is not writable with the held roles',
                HTTP_FORBIDDEN,
            );
        }
    }
}

// Drops values the caller may not read. Unknown ids are
// impossible under RESTRICT and are not guarded.
export function projectReadableValues(
    values: readonly {
        attribute_id: string;
        value: string;
    }[],
    attributesById: ReadonlyMap<
        string, AttributeSchemaRow
    >,
    roles: readonly string[],
): { attribute_id: string; value: string }[] {
    return values.filter((entry) => {
        const attribute = attributesById.get(
            entry.attribute_id,
        )!;
        return rolesCanRead(roles, attribute);
    });
}
