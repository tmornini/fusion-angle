import type {
    FlowRecordEntity,
    RecordAttributeEntity,
    RecordEntity,
    RecordId,
    RecordState,
    RecordStateDetail,
} from '../../../api/types.ts';
import {
    RecordModel,
    assertRecordState,
} from '../../../api/types.ts';
import {
    activeOrganization,
    type RequestContext,
} from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    nowUtc,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import { getFlowEntities } from './flows.ts';

// The flow↔record bindings across EVERY flow the caller's org
// can see — reassembled from the per-flow nested collections,
// since a record may be bound by flows beyond any single one.
// The flows list is org-scoped; each flow's records are fetched
// in parallel and concatenated.
async function getAllFlowRecords(
    ctx: RequestContext,
): Promise<FlowRecordEntity[]> {
    const flows = await getFlowEntities(ctx);
    const perFlow = await Promise.all(
        flows.map(f => ctx.GET<FlowRecordEntity[]>(
            'flows/' + f.id + '/records',
        )),
    );
    return perFlow.flat();
}

export {
    RecordModel,
    RECORD_STATES,
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
    readonly attributeCount: number;
    readonly boundFlowCount: number;
}

const recordChanges = createSubscriptionChannel();

export function subscribeRecordChanges(
    fn: () => void,
): () => void {
    return recordChanges.subscribe(fn);
}

export function notifyRecordChange(): void {
    recordChanges.notify();
}

// Org-nested record-types wire (Task 21). Schema mutations
// stay admin-tier on the nested surface; members GET only.
function recordTypesPath(ctx: RequestContext): string {
    return 'organizations/'
        + activeOrganization(ctx)
        + '/record-types';
}

function recordTypePath(
    ctx: RequestContext,
    id: RecordId,
): string {
    return recordTypesPath(ctx) + '/' + id;
}

export async function getRecordEntities(
    ctx: RequestContext,
): Promise<RecordEntity[]> {
    return ctx.GET<RecordEntity[]>(
        recordTypesPath(ctx),
    );
}

export async function getRecord(
    ctx: RequestContext,
    id: RecordId,
): Promise<RecordEntity> {
    return ctx.GET<RecordEntity>(
        recordTypePath(ctx, id),
    );
}

// Lifecycle-current trio is stamped on the RecordEntity GET
// row (Phase A). Map snake_case wire → RecordStateDetail;
// no second hop to a lifecycle log or history alias.
function recordStateDetailFromRow(
    row: RecordEntity,
): RecordStateDetail {
    return {
        state: assertRecordState(
            row.state, 'record ' + row.id,
        ),
        stateAt: row.state_at,
        stateEventId: row.state_event_id,
    };
}

// The record detail page's read: one domain facet
// carrying identity, content, and lifecycle state —
// the raw row and its separate state never cross the
// seam. Trio is the GET-stamped row fields (Decision 7)
// so a plain field edit (the detail page's no-attribute-
// change save) can echo it without minting a fresh event.
export async function getRecordModel(
    ctx: RequestContext,
    id: RecordId,
): Promise<RecordModel> {
    const row = await getRecord(ctx, id);
    return new RecordModel(
        row, recordStateDetailFromRow(row),
    );
}

export async function getRecords(
    ctx: RequestContext,
): Promise<RecordWithCounts[]> {
    const [rows, flowRecords] = await Promise.all([
        getRecordEntities(ctx),
        getAllFlowRecords(ctx),
    ]);
    // Per-type nested attributes collection — server-side
    // filter replaces the retired flat bulk + client filter.
    const attrLists = await Promise.all(
        rows.map(row => ctx.GET<
            RecordAttributeEntity[]
        >(
            recordTypePath(ctx, row.id)
            + '/attributes',
        )),
    );
    const attrCountByRecord = new Map<
        string, number
    >();
    for (let i = 0; i < rows.length; i++) {
        attrCountByRecord.set(
            rows[i]!.id,
            attrLists[i]!.length,
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
    return rows.map(row => ({
        record: new RecordModel(
            row, recordStateDetailFromRow(row),
        ),
        attributeCount:
            attrCountByRecord.get(row.id)
            ?? 0,
        boundFlowCount:
            flowCountByRecord.get(row.id)
            ?? 0,
    }));
}

// The wire document PUT /records/:id now takes (Decision 7):
// today's entity fields plus the lifecycle trio, camelCase on
// this side of the adapter seam. organization_id is EXCLUDED
// too — the client never supplies it (the org fence stamps it
// downstream). A state-UNCHANGED save (name/description/
// position edited, trio echoed back unchanged) converges to a
// no-op event write at the op; a genuine transition
// (postRecordStateChange below) mints a fresh trio. GET
// RecordEntity also carries snake_case lifecycle stamp fields
// — omit them here so the PUT body is not double-keyed
// (snake + camel).
export type RecordDocumentFields =
    Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    > & {
        readonly state: RecordState;
        readonly stateAt: string;
        readonly stateEventId: string;
    };

export async function putRecord(
    ctx: RequestContext,
    id: RecordId,
    document: RecordDocumentFields,
): Promise<void> {
    const {
        state, stateAt, stateEventId, ...entity
    } = document;
    await ctx.PUT(recordTypePath(ctx, id), {
        ...entity,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    });
    recordChanges.notify();
}

export interface RecordChangeCreate {
    readonly kind: 'create';
    readonly record: Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >;
    readonly attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[];
    readonly initialState: RecordState;
}

export interface RecordChangeEdit {
    readonly kind: 'edit';
    readonly record: Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >;
    readonly attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[];
    readonly removedAttributeIds: readonly string[];
    // The echoed trio (Phase 6 Task 4): the caller already
    // holds the detail model (Task 2's plumbing), so this is a
    // zero-extra-fetch echo of the stored head, exactly like
    // putRecord's own RecordDocumentFields — never a fresh mint.
    readonly state: RecordState;
    readonly stateAt: string;
    readonly stateEventId: string;
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
    // record-write body validator, which requires the column.
    const organization = activeOrganization(ctx);
    const record = {
        ...change.record, organization_id: organization,
    };
    const attributes = change.attributes.map(a => ({
        ...a, organization_id: organization,
    }));
    if (change.kind === 'create') {
        const initialStateEventId =
            generateCryptoSafeBase62();
        await ctx.POST(recordTypesPath(ctx), {
            kind: 'create',
            id,
            record,
            attributes,
            initialState: change.initialState,
            initialStateEventId,
            initialStateAt: nowUtc(),
        });
    } else {
        await ctx.POST(recordTypesPath(ctx), {
            kind: 'edit',
            id,
            record,
            attributes,
            state: change.state,
            state_at: change.stateAt,
            state_event_id: change.stateEventId,
            removedAttributeIds:
                change.removedAttributeIds,
        });
    }
    recordChanges.notify();
}

// A transition: composes the document PUT with a FRESH trio
// (mint-once-reuse — a retry of the SAME transition resends
// this same pinned pair, converging at the op) over the
// record's CURRENT entity fields — hop count 1 -> 1 (one
// ctx.PUT, via putRecord). Strip GET-stamped snake_case trio
// so putRecord's camelCase mint is the only lifecycle payload.
export async function postRecordStateChange(
    ctx: RequestContext,
    record: RecordEntity,
    state: RecordState,
): Promise<void> {
    const {
        id,
        state: _priorState,
        state_at: _priorAt,
        state_event_id: _priorEventId,
        ...entity
    } = record;
    void _priorState;
    void _priorAt;
    void _priorEventId;
    await putRecord(ctx, id, {
        ...entity,
        state,
        stateAt: nowUtc(),
        stateEventId: generateCryptoSafeBase62(),
    });
}
