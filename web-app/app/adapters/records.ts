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
import {
    activeOrg,
    type RequestContext,
} from './shared.ts';
import {
    latestByKey,
} from '../../../api/ledger-reduction.ts';
import {
    buildStateEventOp,
    getRecordStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';

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
    ['records', 'record_attributes', 'states'],
);

export function subscribeRecordChanges(
    fn: () => void,
): () => void {
    return recordChanges.subscribe(fn);
}

export function notifyRecordChange(): void {
    recordChanges.notify();
}

export async function getRecordEntities(
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
    const latest = latestByKey(events, ev => ev.entity_id)
        .get(id);
    if (latest === undefined) {
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
        getRecordEntities(ctx),
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
    entity: Omit<RecordEntity, 'id' | 'organization_id'>,
): Promise<void> {
    await ctx.PUT(`records/${id}`, {
        ...entity,
    });
    recordChanges.notify();
}

export interface RecordChangeCreate {
    readonly kind: 'create';
    readonly record:
        Omit<RecordEntity, 'id' | 'organization_id'>;
    readonly attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[];
    readonly initialState: RecordState;
}

export interface RecordChangeEdit {
    readonly kind: 'edit';
    readonly record:
        Omit<RecordEntity, 'id' | 'organization_id'>;
    readonly attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[];
    readonly removedAttributeIds: readonly string[];
}

export type RecordChange =
    | RecordChangeCreate
    | RecordChangeEdit;

export async function postRecordChange(
    ctx: RequestContext,
    id: RecordId,
    change: RecordChange,
): Promise<void> {
    // The server stamps organization_id from the verified
    // token; this present-and-valid value only satisfies the
    // multi-put body validator, which requires the column.
    const org = activeOrg(ctx);
    const record = {
        ...change.record, organization_id: org,
    };
    const attributes = change.attributes.map(a => ({
        ...a, organization_id: org,
    }));
    if (change.kind === 'create') {
        const initialStateEventId =
            generateCryptoSafeBase62();
        await ctx.POST('records-multi-put', {
            kind: 'create',
            id,
            record,
            attributes,
            initialState: change.initialState,
            initialStateEventId,
        });
    } else {
        await ctx.POST('records-multi-put', {
            kind: 'edit',
            id,
            record,
            attributes,
            removedAttributeIds:
                change.removedAttributeIds,
        });
    }
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
