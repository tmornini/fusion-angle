import type { RequestContext } from './request-context.ts';
import { activeOrganization } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { compareIdentifiers } from '../shared/identifier.ts';

// Domain face of a record instance: values as a map keyed
// by attribute id, and the head it was read from, which a
// page holds across an edit and its write latches.
export interface RecordInstance {
    readonly id: string;
    readonly recordTypeId: string;
    readonly values: ReadonlyMap<string, string>;
    readonly message: HttpMessage<InstanceDetailWire>;
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
    message: HttpMessage<InstanceDetailWire>,
): RecordInstance {
    const row = message.body().toValue();
    return {
        id: row.id,
        recordTypeId: row.record_type_id,
        values: valuesMap(row.values),
        message,
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

// By id: the collection orders by write, and a saved
// instance must not move in the records list or the
// workbox picker.
export async function getRecordInstances(
    ctx: RequestContext,
    recordTypeId: string,
): Promise<RecordInstance[]> {
    return (await ctx.GETCollection<InstanceDetailWire>(
        instancesPath(ctx, recordTypeId),
    )).map(toRecordInstance)
        .sort((a, b) => compareIdentifiers(a.id, b.id));
}

export async function getRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<RecordInstance> {
    return toRecordInstance(await ctx.GET<InstanceDetailWire>(
        instancePath(ctx, recordTypeId, id),
    ));
}

// PATCH create, declared as creating. Answers the instance
// the create wrote, its message the new head, so the caller
// can enter edit without a re-GET.
export async function putRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
    set: readonly InstanceValueSet[],
): Promise<RecordInstance> {
    return toRecordInstance(await ctx.PATCH<InstanceDetailWire>(
        instancePath(ctx, recordTypeId, id),
        { set: setWire(set) },
        'creates',
    ));
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

// Latches the head the page holds.
export async function deleteRecordInstance(
    ctx: RequestContext,
    instance: RecordInstance,
): Promise<void> {
    await ctx.DELETE(
        instancePath(ctx, instance.recordTypeId, instance.id),
        [instance.message],
    );
}

// The instance's stored PUT parts, oldest first. Each
// body is the instance, projected by the reader's
// current attribute schema.
export async function getRecordInstanceVersions(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<HttpMessage<InstanceDetailWire>[]> {
    return await ctx.GETCollection<InstanceDetailWire>(
        instancePath(ctx, recordTypeId, id) + '/versions/',
    );
}
