import type {
    RecordAttribute,
    RecordAttributeEntity,
    RecordAttributeId,
    RecordId,
} from '../../../api/types.ts';
import { jsonArrayField } from '../../../api/types.ts';
import {
    validateConstraintArrayJson,
    validateStringArrayJson,
} from '../../../api/validators.ts';
import type { RequestContext } from './shared.ts';
import {
    notifyRecordChange,
} from './records.ts';

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

export async function getRecordAttributeRows(
    ctx: RequestContext,
): Promise<RecordAttribute[]> {
    const rows = await ctx.GET<
        RecordAttributeEntity[]
    >('record-attributes');
    return rows.map(toRecordAttribute);
}

export async function getRecordAttribute(
    ctx: RequestContext,
    id: RecordAttributeId,
): Promise<RecordAttribute> {
    const row = await ctx.GET<RecordAttributeEntity>(
        `record-attributes/${id}`,
    );
    return toRecordAttribute(row);
}

export async function getRecordAttributesByRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<RecordAttribute[]> {
    const rows = await getRecordAttributeRows(ctx);
    return rows
        .filter(a => a.record_id === recordId)
        .toSorted(
            (a, b) =>
                a.sort_order - b.sort_order,
        );
}

export async function putRecordAttribute(
    ctx: RequestContext,
    id: RecordAttributeId,
    attribute: Omit<
        RecordAttribute, 'id' | 'organization_id'
    >,
): Promise<void> {
    await ctx.PUT(`record-attributes/${id}`, {
        record_id: attribute.record_id,
        name: attribute.name,
        attribute_type: attribute.attribute_type,
        sort_order: attribute.sort_order,
        options: jsonArrayField(attribute.options),
        constraints: jsonArrayField(
            attribute.constraints,
        ),
    });
    notifyRecordChange();
}

export async function deleteRecordAttribute(
    ctx: RequestContext,
    id: RecordAttributeId,
): Promise<void> {
    await ctx.DELETE(
        `record-attributes/${id}`,
    );
    notifyRecordChange();
}
