import type {
    AttributeType,
    Constraint,
    Id,
    RecordAttributeId,
    RecordId,
} from '../../../api/types.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
} from '../../../api/types.ts';
import {
    activeOrganization,
    type RequestContext,
} from './shared.ts';

export type {
    RecordAttributeId,
} from '../../../api/types.ts';

// Domain twin of the attribute document: above the storage
// seam the fields speak camelCase — snake_case stays below.
// options/constraints arrive native from the gate. Nested
// wire echoes record_type_id; the domain keeps recordId as
// the parent type id (one name, one voice for callers).
// ACL arrays mirror storage stamps (Task 22 instance UI).
export interface RecordAttribute {
    id: RecordAttributeId;
    organizationId: Id;
    recordId: RecordId;
    name: string;
    attributeType: AttributeType;
    sortOrder: number;
    options: string[];
    constraints: Constraint[];
    readRoles: readonly string[];
    writeRoles: readonly string[];
}

// Nested attribute wire (Task 7 / Task 21): parentage is
// record_type_id on the echo. Flat alias still stamps
// record_id; accept either so a residual flat read maps.
interface AttributeWire {
    readonly id: string;
    readonly organization_id: string;
    readonly record_type_id?: string;
    readonly record_id?: string;
    readonly name: string;
    readonly attribute_type: AttributeType;
    readonly sort_order: number;
    readonly options: string[];
    readonly constraints: Constraint[];
    readonly read_roles?: readonly string[];
    readonly write_roles?: readonly string[];
}

function toRecordAttribute(
    entity: AttributeWire,
): RecordAttribute {
    const recordId =
        entity.record_type_id ?? entity.record_id;
    if (recordId === undefined) {
        throw new Error(
            'attribute wire missing parent type id: '
            + entity.id,
        );
    }
    return {
        id: entity.id,
        organizationId: entity.organization_id,
        recordId,
        name: entity.name,
        attributeType: entity.attribute_type,
        sortOrder: entity.sort_order,
        options: entity.options,
        constraints: entity.constraints,
        readRoles: entity.read_roles
            ?? [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        writeRoles: entity.write_roles
            ?? [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    };
}

function attributesPath(
    ctx: RequestContext,
    recordTypeId: RecordId,
): string {
    return 'organizations/'
        + activeOrganization(ctx)
        + '/record-types/'
        + recordTypeId
        + '/attributes';
}

// Per-type nested collection — the server filters; the
// client-side filterByField walk is retired (Task 21).
export async function getRecordAttributesByRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<RecordAttribute[]> {
    const rows = await ctx.GET<AttributeWire[]>(
        attributesPath(ctx, recordId),
    );
    return rows
        .map(toRecordAttribute)
        .toSorted(
            (a, b) =>
                a.sortOrder - b.sortOrder,
        );
}
