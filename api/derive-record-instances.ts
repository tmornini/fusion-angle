import type { DbAdapter } from './db.ts';
import type { Id } from './types.ts';
import {
    deriveDocumentsAt,
    documentMessagePairsAt,
    byIdAscending,
    type DocumentMessagePair,
} from './derive-documents.ts';

// Instance derive surface — full-state heads (R5 / Task 14).
// NO fold. Each revision pair stores the COMPLETE value map
// under {values}; genesis wire uses {set}. revisionValuesOf
// is the ONE normalizer at the seam. DOCUMENT_METHODS stays
// PUT|DELETE — revision storage is PUT with full state, not
// a PATCH method pair. Do not edit derive-documents.ts.

const DELETE_METHOD = 'DELETE';
const PUT_METHOD = 'PUT';

export interface InstanceValue {
    readonly attribute_id: string;
    readonly value: string;
}

export interface InstanceRevision {
    readonly at: string;
    readonly messagePairId: string;
    readonly values: readonly InstanceValue[];
}

export interface InstanceHead {
    readonly id: string;
    readonly messagePairId: string; // latch pair id
    readonly values: readonly InstanceValue[];
}

export function instanceGetBody(
    id: string,
    organizationId: string,
    recordTypeId: string,
    values: readonly InstanceValue[],
): Record<string, unknown> {
    return {
        id,
        organization_id: organizationId,
        record_type_id: recordTypeId,
        values,
    };
}

export function projectionOmitsStored(
    stored: readonly InstanceValue[],
    projected: readonly InstanceValue[],
): boolean {
    if (projected.length !== stored.length) {
        return true;
    }
    const visible = new Set(
        projected.map((row) => row.attribute_id),
    );
    return stored.some(
        (row) => !visible.has(row.attribute_id),
    );
}

export function instancesUriPrefix(
    organization: Id,
    recordTypeId: Id,
): string {
    return '/organizations/' + organization
        + '/record-types/' + recordTypeId
        + '/instances/';
}

// body.values ?? body.set — genesis wire uses {set};
// revision pairs use {values}. ONE normalizer; no second
// dialect leaks into handlers or adapters.
export function revisionValuesOf(
    body: Record<string, unknown>,
): InstanceValue[] {
    const raw = body['values'] ?? body['set'];
    if (!Array.isArray(raw)) return [];
    const out: InstanceValue[] = [];
    for (const entry of raw) {
        if (
            entry === null
            || typeof entry !== 'object'
            || Array.isArray(entry)
        ) {
            continue;
        }
        const row = entry as Record<string, unknown>;
        const attributeId = row['attribute_id'];
        const value = row['value'];
        if (
            typeof attributeId === 'string'
            && typeof value === 'string'
        ) {
            out.push({
                attribute_id: attributeId,
                value,
            });
        }
    }
    return out;
}

// Pure: apply set overwrites, then clear deletes; emit
// attribute_id-lexicographic for deterministic wire bytes.
// clear of already-absent is a no-op on the map (caller may
// still append a revision — that is Task 17's concern).
export function mergeInstanceValues(
    head: readonly InstanceValue[],
    delta: {
        set?: readonly InstanceValue[];
        clear?: readonly string[];
    },
): InstanceValue[] {
    const map = new Map<string, string>();
    for (const entry of head) {
        map.set(entry.attribute_id, entry.value);
    }
    if (delta.set !== undefined) {
        for (const entry of delta.set) {
            map.set(entry.attribute_id, entry.value);
        }
    }
    if (delta.clear !== undefined) {
        for (const attributeId of delta.clear) {
            map.delete(attributeId);
        }
    }
    return [...map.entries()]
        .sort((a, b) =>
            a[0] < b[0] ? -1
                : a[0] > b[0] ? 1
                    : 0,
        )
        .map(([attribute_id, value]) => ({
            attribute_id,
            value,
        }));
}

async function fetchInstanceMessagePairs(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
): Promise<readonly DocumentMessagePair[]> {
    const prefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const messagePairs = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    return documentMessagePairsAt(messagePairs, prefix);
}

// undefined when absent OR tombstoned (DELETE is the last
// document message pair) — tombstone = absent for every read path.
// Head body: revisionValuesOf(head body) — ONE head pair via
// deriveDocumentsAt (PUT|DELETE only; no fold across pairs).
export async function deriveInstanceHead(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
    instanceId: Id,
): Promise<InstanceHead | undefined> {
    const prefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const messagePairs = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    const document = deriveDocumentsAt(
        messagePairs, prefix,
    ).get(instanceId);
    if (document === undefined) return undefined;
    return {
        id: instanceId,
        messagePairId: document.messagePairId,
        values: revisionValuesOf(document.body),
    };
}

// id-lex ASC; tombstones omitted.
export async function deriveInstanceCollection(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
): Promise<InstanceHead[]> {
    const prefix = instancesUriPrefix(
        organization, recordTypeId,
    );
    const messagePairs = await db.messagePairs.getAllWhere(
        'uri_collection', prefix,
    );
    const documents = deriveDocumentsAt(
        messagePairs, prefix,
    );
    const rows: InstanceHead[] = [];
    for (const document of documents.values()) {
        rows.push({
            id: document.uriId,
            messagePairId: document.messagePairId,
            values: revisionValuesOf(document.body),
        });
    }
    return rows.sort(byIdAscending);
}

// ASC; empty when absent or tombstoned; each entry carries
// FULL state (the stored body — no fold of prior pairs).
export async function deriveInstanceRevisions(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
    instanceId: Id,
): Promise<InstanceRevision[]> {
    const messagePairs = (await fetchInstanceMessagePairs(
        db, organization, recordTypeId,
    )).filter((messagePair) =>
        messagePair.uriId === instanceId);
    if (messagePairs.length === 0) return [];
    const last = messagePairs[messagePairs.length - 1]!;
    if (last.method === DELETE_METHOD) return [];
    const revisions: InstanceRevision[] = [];
    for (const messagePair of messagePairs) {
        if (messagePair.method !== PUT_METHOD) continue;
        revisions.push({
            at: messagePair.at,
            messagePairId: messagePair.id,
            values: revisionValuesOf(messagePair.body),
        });
    }
    return revisions;
}
