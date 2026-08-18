import type { RequestContext } from './shared.ts';
import { activeOrganization } from './shared.ts';

// Domain face of a record instance (Task 21): values as a
// map keyed by attribute id; etag is the unquoted 64-hex
// advertised ETag for If-Match on PATCH.
export interface RecordInstance {
    readonly id: string;
    readonly recordTypeId: string;
    readonly values: ReadonlyMap<string, string>;
    readonly etag: string;
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
    readonly version?: string;
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

function requireEtag(
    etag: string | undefined,
    where: string,
): string {
    if (etag === undefined || etag === '') {
        throw new Error(
            'missing ETag on ' + where,
        );
    }
    return etag;
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
    const rows = await ctx.GET<InstanceDetailWire[]>(
        instancesPath(ctx, recordTypeId),
    );
    return rows.map(row => toRecordInstance(
        row,
        requireEtag(
            row.etag,
            'instance list row ' + row.id,
        ),
    ));
}

// Detail: ETag is header-authoritative (not body-embedded).
export async function getRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
): Promise<RecordInstance> {
    const { body, etag } = await ctx.GETWithEtag<
        InstanceDetailWire
    >(instancePath(ctx, recordTypeId, id));
    return toRecordInstance(
        body,
        requireEtag(etag, 'instance detail ' + id),
    );
}

// PATCH create (no If-Match). Returns the fresh etag
// so the caller can enter edit without a re-GET.
export async function putRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
    set: readonly InstanceValueSet[],
): Promise<{ etag: string }> {
    const { etag } = await ctx.PATCHWithEtag(
        instancePath(ctx, recordTypeId, id),
        { set: setWire(set) },
    );
    return {
        etag: requireEtag(
            etag, 'instance PATCH create ' + id,
        ),
    };
}

// If-Match: '"' + etag + '"'. 412 surfaces as RequestError
// — the adapter does NOT auto-retry (client owns the loop).
export async function patchRecordInstance(
    ctx: RequestContext,
    recordTypeId: string,
    id: string,
    etag: string,
    delta: {
        set?: readonly InstanceValueSet[];
        clear?: readonly string[];
    },
): Promise<{ etag: string }> {
    const body: Record<string, unknown> = {};
    if (delta.set !== undefined) {
        body['set'] = setWire(delta.set);
    }
    if (delta.clear !== undefined) {
        body['clear'] = [...delta.clear];
    }
    const result = await ctx.PATCHWithEtag(
        instancePath(ctx, recordTypeId, id),
        body,
        [['If-Match', '"' + etag + '"']],
    );
    return {
        etag: requireEtag(
            result.etag, 'instance PATCH ' + id,
        ),
    };
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
    const rows = await ctx.GET<InstanceHistoryWire[]>(
        instancePath(ctx, recordTypeId, id)
        + '/versions',
    );
    return rows.map(row => ({
        at: row.at,
        etag: row.etag,
        values: valuesMap(row.values),
    }));
}
