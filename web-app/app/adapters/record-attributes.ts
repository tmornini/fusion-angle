import type {
    RecordAttribute,
    RecordAttributeEntity,
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
    RecordAttribute,
    RecordAttributeId,
} from '../../../api/types.ts';

function toRecordAttribute(
    entity: RecordAttributeEntity,
): RecordAttribute {
    return {
        id: entity.id,
        organization_id: entity.organization_id,
        record_id: entity.record_id,
        name: entity.name,
        attribute_type: entity.attribute_type,
        sort_order: entity.sort_order,
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
    return filterByField(rows, 'record_id', recordId)
        .toSorted(
            (a, b) =>
                a.sort_order - b.sort_order,
        );
}
