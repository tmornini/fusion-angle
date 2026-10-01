import type {
    FlowRecordEntity,
    RecordAttributeEntity,
    RecordEntity,
    RecordId,
    RecordState,
} from '../shared/types.ts';
import {
    RecordModel,
    assertRecordState,
    documentFieldsOf,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    activeOrganization,
    organizationItem,
    type RequestContext,
} from './request-context.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
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
        flows.map(f => ctx.GETCollection<FlowRecordEntity>(
            organizationItem(ctx, 'flows', f.body().toValue().id)
                + '/records/',
        ).then(parts => parts.map((m) => m.body().toValue()))),
    );
    return perFlow.flat();
}

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
        + '/record-types/';
}

function recordTypePath(
    ctx: RequestContext,
    id: RecordId,
): string {
    return recordTypesPath(ctx) + id;
}

export async function getRecordEntities(
    ctx: RequestContext,
): Promise<HttpMessage<RecordEntity>[]> {
    return await ctx.GETCollection<RecordEntity>(
        recordTypesPath(ctx),
    );
}

export async function getRecord(
    ctx: RequestContext,
    id: RecordId,
): Promise<HttpMessage<RecordEntity>> {
    return await ctx.GET<RecordEntity>(
        recordTypePath(ctx, id),
    );
}

// Domain state rides the RecordEntity GET row; narrow it
// once, at the wire.
function recordStateOf(row: RecordEntity): RecordState {
    return assertRecordState(
        row.state, 'record ' + row.id,
    );
}

export function recordOf(
    message: HttpMessage<RecordEntity>,
): RecordModel {
    return new RecordModel(
        message, recordStateOf(message.body().toValue()),
    );
}

// The record detail page's read: one domain facet
// carrying identity, content, lifecycle state, and the
// message it was read from, so a plain field edit (the
// detail page's no-attribute-change save) can echo the
// GET-stamped state without minting a fresh event, and
// every write latches the head the page holds.
export async function getRecordModel(
    ctx: RequestContext,
    id: RecordId,
): Promise<RecordModel> {
    return recordOf(await getRecord(ctx, id));
}

export async function getRecords(
    ctx: RequestContext,
): Promise<RecordWithCounts[]> {
    const [messages, flowRecords] = await Promise.all([
        getRecordEntities(ctx),
        getAllFlowRecords(ctx),
    ]);
    const records = messages.map(recordOf);
    // Per-type nested attributes collection — server-side
    // filter replaces the retired flat bulk + client filter.
    const attrLists = await Promise.all(
        records.map(record => ctx.GETCollection<
            RecordAttributeEntity
        >(
            recordTypePath(ctx, record.idForLink())
            + '/attributes/',
        ).then(parts => parts.map((m) => m.body().toValue()))),
    );
    const attrCountByRecord = new Map<
        string, number
    >();
    for (let i = 0; i < records.length; i++) {
        attrCountByRecord.set(
            records[i]!.idForLink(),
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
    return records.map(record => ({
        record,
        attributeCount:
            attrCountByRecord.get(record.idForLink())
            ?? 0,
        boundFlowCount:
            flowCountByRecord.get(record.idForLink())
            ?? 0,
    }));
}

// The wire document PUT /records/:id now takes today's entity
// fields plus state, camelCase on this side of the adapter
// seam. organization_id is EXCLUDED too — the client never
// supplies it (the org fence stamps it downstream). A
// state-UNCHANGED save (name/description/position edited,
// state echoed back unchanged) converges to a no-op event
// write at the op; a genuine transition
// (postRecordStateChange below) sends a new state.
export type RecordDocumentFields =
    Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
    >;

// A save from the held record type names the head it
// replaces, so a write over a newer head is refused rather
// than lost.
export async function putRecord(
    ctx: RequestContext,
    held: HttpMessage<RecordEntity>,
    document: RecordDocumentFields,
): Promise<HttpMessage<RecordEntity>> {
    const saved = await ctx.PUT<RecordEntity>(
        recordTypePath(ctx, held.body().toValue().id),
        { ...document },
        [held],
    );
    recordChanges.notify();
    return saved;
}

export interface RecordChangeCreate {
    readonly kind: 'create';
    readonly record: Omit<
        RecordEntity,
        | 'id'
        | 'organization_id'
        | 'state'
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
    >;
    readonly attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[];
    readonly removedAttributeIds: readonly string[];
    readonly state: RecordState;
    readonly held: HttpMessage<RecordEntity>;
}

export type RecordChange =
    | RecordChangeCreate
    | RecordChangeEdit;

export async function postRecordChange(
    ctx: RequestContext,
    id: RecordId,
    change: RecordChange,
): Promise<HttpMessage<RecordEntity>> {
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
    let saved: HttpMessage<RecordEntity>;
    if (change.kind === 'create') {
        saved = await ctx.POST<RecordEntity>(recordTypesPath(ctx), {
            kind: 'create',
            id,
            record,
            attributes,
            initialState: change.initialState,
        });
    } else {
        // The edit is an operation on the type: it names the
        // head the page holds, so a 412 surfaces as
        // RequestError.
        saved = await ctx.POST<RecordEntity>(recordTypesPath(ctx), {
            kind: 'edit',
            id,
            record,
            attributes,
            state: change.state,
            removedAttributeIds:
                change.removedAttributeIds,
        }, [change.held]);
    }
    recordChanges.notify();
    return saved;
}

// A transition: composes the document PUT with a FRESH state
// (mint-once-reuse — a retry of the SAME transition resends
// this same pinned pair, converging at the op) over the held
// record's entity fields — hop count 1 -> 1 (one ctx.PUT,
// via putRecord, latched on the held record). The new state
// replaces the held one in the PUT body.
export async function postRecordStateChange(
    ctx: RequestContext,
    held: HttpMessage<RecordEntity>,
    state: RecordState,
): Promise<HttpMessage<RecordEntity>> {
    return await putRecord(ctx, held, {
        ...documentFieldsOf(held), state,
    });
}
