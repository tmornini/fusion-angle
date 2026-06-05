import type {
    RecordAttributeEntity,
    RecordAttributeId,
    RecordId,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    notifyRecordChange,
} from './records.ts';

export type {
    RecordAttributeEntity,
    RecordAttributeId,
} from '../../../api/types.ts';

export async function getRecordAttributeRows(
    ctx: RequestContext,
): Promise<RecordAttributeEntity[]> {
    return ctx.GET<RecordAttributeEntity[]>(
        'record-attributes',
    );
}

export async function getRecordAttribute(
    ctx: RequestContext,
    id: RecordAttributeId,
): Promise<RecordAttributeEntity> {
    return ctx.GET<RecordAttributeEntity>(
        `record-attributes/${id}`,
    );
}

export async function getRecordAttributesByRecord(
    ctx: RequestContext,
    recordId: RecordId,
): Promise<RecordAttributeEntity[]> {
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
    entity: Omit<
        RecordAttributeEntity, 'id' | 'organization_id'
    >,
): Promise<void> {
    await ctx.PUT(`record-attributes/${id}`, {
        ...entity,
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
