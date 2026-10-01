import type { RequestContext } from './request-context.ts';
import { activeOrganization } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

// Domain face of a record instance: values as a map keyed
// by attribute id. etag is the unquoted pair id for
// If-Match on PATCH.
export interface RecordInstance {
    readonly id: string;
    readonly recordTypeId: string;
    readonly values: ReadonlyMap<string, string>;
    readonly etag: string;
}

// The instance and the head it was read from, which the
// page holds across an edit and its PATCH latches.
export interface RecordInstanceRead {
    readonly instance: RecordInstance;
    readonly read: HttpMessage<InstanceDetailWire>;
}

export interface RecordInstanceHistoryEntry {
    readonly at: string;
    readonly etag: string;
    readonly values: ReadonlyMap<string, string>;
}

export interface InstanceValueSet {
    readonly attributeId: string;
    readonly value: string;
}

interface InstanceValueWire {
    readonly attribute_id: string;
    readonly value: string;
}

interface InstanceDetailWire {
    readonly id: string;
    readonly organization_id: string;
    readonly record_type_id: string;
    readonly values: readonly InstanceValueWire[];
    readonly etag?: string;
}

interface InstanceHistoryWire {
    readonly at: string;
    readonly etag: string;
    readonly values: readonly InstanceValueWire[];
}

function instancesPath(
    ctx: RequestContext,
    recordTypeId: string,
): string {
    return 'organizations/'
        + activeOrganization(ctx)
        + '/record-types/'
        + recordTypeId
        + '/instances/';
}

function instancePath(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): string {
    return instancesPath(ctx, recordTypeId) + id;
}

function valuesMap(
    values: readonly InstanceValueWire[],
): ReadonlyMap<string, string> {
    return new Map(
        values.map(v => [v.attribute_id, v.value]),
    );
}

function toRecordInstance(
    row: InstanceDetailWire,
    etag: string,
): RecordInstance {
    return {
        id: row.id,
        recordTypeId: row.record_type_id,
        values: valuesMap(row.values),
        etag,
    };
}

function setWire(
    set: readonly InstanceValueSet[],
): InstanceValueWire[] {
    return set.map(entry => ({
        attribute_id: entry.attributeId,
        value: entry.value,
    }));
}

export async function getRecordInstances(
    ctx: RequestContext,
    recordTypeId: string,
): Promise<RecordInstance[]> {
    const rows = (await ctx.GET<InstanceDetailWire[]>(
        instancesPath(ctx, recordTypeId),
    )).body().toValue();
    return rows.map(row => {
        // A list row with no tag leaves nothing for a
        // page to latch; this is a bug, not an absence.
        if (row.etag === undefined) {
            throw new Error(
                'the instance list row ' + row.id
                    + ' carried no ETag',
            );
        }
        return toRecordInstance(row, row.etag);
    });
}

// Detail: the tag is header-authoritative (not
// body-embedded); the message the page keeps carries it.
export async function getRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<RecordInstanceRead> {
    const read = await ctx.GET<InstanceDetailWire>(
        instancePath(ctx, recordTypeId, id),
    );
    return {
        instance: toRecordInstance(
            read.body().toValue(),
            read.query('header.etag').toText().slice(1, -1),
        ),
        read,
    };
}

// PATCH create, declared as creating. Answers the create's
// message so the caller can enter edit without a re-GET.
export function putRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
    set: readonly InstanceValueSet[],
): Promise<HttpMessage> {
    return ctx.PATCH(
        instancePath(ctx, recordTypeId, id),
        { set: setWire(set) },
        'creates',
    );
}

// Latches the head the page holds and answers the new one.
// 412 surfaces as RequestError — the adapter does NOT
// auto-retry (client owns the loop).
export function patchRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
    held: HttpMessage,
    delta: {
        set?: readonly InstanceValueSet[];
        clear?: readonly string[];
    },
): Promise<HttpMessage> {
    const body: Record<string, unknown> = {};
    if (delta.set !== undefined) {
        body['set'] = setWire(delta.set);
    }
    if (delta.clear !== undefined) {
        body['clear'] = [...delta.clear];
    }
    return ctx.PATCH(
        instancePath(ctx, recordTypeId, id),
        body,
        [held],
    );
}

export async function deleteRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<void> {
    await ctx.DELETE(
        instancePath(ctx, recordTypeId, id),
    );
}

export async function getRecordInstanceHistory(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<RecordInstanceHistoryEntry[]> {
    const rows = (await ctx.GET<InstanceHistoryWire[]>(
        instancePath(ctx, recordTypeId, id)
        + '/versions',
    )).body().toValue();
    return rows.map(row => ({
        at: row.at,
        etag: row.etag,
        values: valuesMap(row.values),
    }));
}
