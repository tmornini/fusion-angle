import type {
    AttributeType,
    Constraint,
    Id,
    RecordAttributeEntity,
    RecordAttributeId,
    RecordId,
} from '../../../api/types.ts';
import {
    validateConstraintArrayJson,
    validateStringArrayJson,
} from '../../../api/validators.ts';
import {
    filterByField,
    type RequestContext,
} from './shared.ts';

export type {
    RecordAttributeId,
} from '../../../api/types.ts';

// The parsed domain twin of RecordAttributeEntity: the
// adapter is the divorce point, so above the storage seam
// `options` and `constraints` are real arrays (never the
// JsonArrayField strings the datastore persists) and the
// fields speak camelCase — snake_case stays below the seam.
export interface RecordAttribute {
    id: RecordAttributeId;
    organizationId: Id;
    recordId: RecordId;
    name: string;
    attributeType: AttributeType;
    sortOrder: number;
    options: string[];
    constraints: Constraint[];
}

function toRecordAttribute(
    entity: RecordAttributeEntity,
): RecordAttribute {
    return {
        id: entity.id,
        organizationId: entity.organization_id,
        recordId: entity.record_id,
        name: entity.name,
        attributeType: entity.attribute_type,
        sortOrder: entity.sort_order,
        options: validateStringArrayJson(
            entity.options,
            'recordAttribute.options',
        ),
        constraints: validateConstraintArrayJson(
            entity.constraints,
            'recordAttribute.constraints',
        ),
    };
}

export async function getRecordAttributeEntities(
    ctx: RequestContext,
): Promise<RecordAttribute[]> {
    const rows = await ctx.GET<
        RecordAttributeEntity[]
    >('record-attributes');
    return rows.map(toRecordAttribute);
}

export async function getRecordAttributesByRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<RecordAttribute[]> {
    const rows = await getRecordAttributeEntities(ctx);
    return filterByField(rows, 'recordId', recordId)
        .toSorted(
            (a, b) =>
                a.sortOrder - b.sortOrder,
        );
}
