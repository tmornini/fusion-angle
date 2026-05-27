import type {
    FlowRecordEntity,
    RecordAttributeEntity,
    RecordEntity,
    RecordId,
    RecordState,
    StateEntity,
} from '../../../api/types.ts';
import {
    RecordModel,
    assertRecordState,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildStateEventOp,
    getRecordStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

export {
    RecordModel,
    RECORD_STATES,
    RECORD_STATE_CONFIG,
    isRecordState,
    assertRecordState,
} from '../../../api/types.ts';
export type {
    RecordEntity,
    RecordId,
    RecordState,
} from '../../../api/types.ts';

export interface RecordWithCounts {
    readonly record: RecordModel;
    readonly entity: RecordEntity;
    readonly attributeCount: number;
    readonly boundFlowCount: number;
}

const recordChanges = createSubscriptionChannel(
    ['records', 'record-attributes', 'states'],
);

export function subscribeRecordChanges(
    fn: () => void,
): () => void {
    return recordChanges.subscribe(fn);
}

export function notifyRecordChange(): void {
    recordChanges.notify();
}

export async function getRecordRows(
    ctx: RequestContext,
): Promise<RecordEntity[]> {
    return ctx.GET<RecordEntity[]>('records');
}

export async function getRecord(
    ctx: RequestContext,
    id: RecordId,
): Promise<RecordEntity> {
    return ctx.GET<RecordEntity>(
        `records/${id}`,
    );
}

export async function getRecordState(
    ctx: RequestContext,
    id: RecordId,
): Promise<RecordState> {
    const events = await ctx.GET<StateEntity[]>(
        `entity-states/${id}/history`,
    );
    const latest = events.reduce<
        StateEntity | null
    >(
        (acc, ev) =>
            acc === null || ev.at >= acc.at
                ? ev
                : acc,
        null,
    );
    if (latest === null) {
        throw new Error(
            'no state event for record ' + id,
        );
    }
    return assertRecordState(
        latest.state, 'record ' + id,
    );
}

export async function getRecords(
    ctx: RequestContext,
): Promise<RecordWithCounts[]> {
    const [
        rows, attributes, flowRecords, stateMap,
    ] = await Promise.all([
        getRecordRows(ctx),
        ctx.GET<RecordAttributeEntity[]>(
            'record-attributes',
        ),
        ctx.GET<FlowRecordEntity[]>(
            'flow-records',
        ),
        getRecordStates(ctx),
    ]);
    const attrCountByRecord = new Map<
        string, number
    >();
    for (const a of attributes) {
        attrCountByRecord.set(
            a.record_id,
            (attrCountByRecord
                .get(a.record_id) ?? 0) + 1,
        );
    }
    const flowCountByRecord = new Map<
        string, number
    >();
    for (const fr of flowRecords) {
        flowCountByRecord.set(
            fr.record_id,
            (flowCountByRecord
                .get(fr.record_id) ?? 0) + 1,
        );
    }
    return rows.map(row => {
        const state = stateMap.get(row.id);
        if (state === undefined) {
            throw new Error(
                'Record has no state event: '
                + row.id,
            );
        }
        return {
            record: new RecordModel(row, state),
            entity: row,
            attributeCount:
                attrCountByRecord.get(row.id)
                ?? 0,
            boundFlowCount:
                flowCountByRecord.get(row.id)
                ?? 0,
        };
    });
}

export async function putRecord(
    ctx: RequestContext,
    id: RecordId,
    entity: Omit<RecordEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`records/${id}`, entity);
    recordChanges.notify();
}

export async function deleteRecord(
    ctx: RequestContext,
    id: RecordId,
): Promise<void> {
    await ctx.DELETE(`records/${id}`);
    recordChanges.notify();
}

export async function postRecordCreation(
    ctx: RequestContext,
    id: RecordId,
    entity: Omit<RecordEntity, 'id'>,
    initialState: RecordState,
): Promise<void> {
    const recordBody =
        entity as unknown as Record<
            string, unknown
        >;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `records/${id}`,
                body: recordBody,
            },
            await buildStateEventOp(
                ctx, id, initialState,
            ),
        ],
    });
    recordChanges.notify();
}

export async function postRecordStateChange(
    ctx: RequestContext,
    id: RecordId,
    state: RecordState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx, id, state,
            ),
        ],
    });
    recordChanges.notify();
}

export async function archiveRecord(
    ctx: RequestContext,
    id: RecordId,
): Promise<void> {
    await postRecordStateChange(
        ctx, id, 'archived',
    );
}
