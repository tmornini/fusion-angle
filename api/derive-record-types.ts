import type { DbAdapter } from './db.ts';
import { missedReadError } from './derive-states.ts';
import type { Id, StateEntity } from './types.ts';
import { pickString, pickNumber } from './validators.ts';
import {
    deriveDocumentsAt,
    documentMessagePairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentMessagePair,
} from './derive-documents.ts';
import { liveHeadId, messageStore } from
    './message-store.ts';

// Org-nested record-types derive surface, plus the folded
// flat-records history helper (formerly derive-records.ts).
// Pair-plane only: prefix scan + head reduction + lifecycle
// trio, same primitives as derive-ideas / document-family.

const RECORD_TYPES_TABLE = 'record_types';

// Wire row for a live record-type document.
export interface RecordTypeWireRow {
    readonly id: Id;
    readonly organization_id: Id;
    readonly name: string;
    readonly description: string;
    readonly position: number;
    readonly state: string;
}

export function recordTypesUriPrefix(
    organization: Id,
): string {
    return '/organizations/' + organization
        + '/record-types/';
}

export function recordTypeEntityOf(
    document: DerivedDocument,
    organization: Id,
): RecordTypeWireRow {
    const body = document.body;
    return {
        id: document.name,
        organization_id: organization,
        name: pickString(body, 'name'),
        description: pickString(body, 'description'),
        position: pickNumber(body, 'position'),
        state: pickString(body, 'state'),
    };
}

async function fetchRecordTypeMessagePairs(
    db: DbAdapter,
    prefix: string,
): Promise<{
    readonly documents: Map<string, DerivedDocument>;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    return {
        documents: deriveDocumentsAt(messagePairs, prefix),
        messagePairs: documentMessagePairsAt(
            messagePairs, prefix,
        ),
    };
}

async function fetchRecordTypeDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    id: Id,
): Promise<{
    readonly document: DerivedDocument | undefined;
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, id,
    );
    return {
        document: deriveDocumentsAt(history, prefix).get(id),
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}

export async function deriveRecordTypeCollection(
    db: DbAdapter,
    organization: Id,
): Promise<RecordTypeWireRow[]> {
    const prefix = recordTypesUriPrefix(organization);
    const { documents, messagePairs } =
        await fetchRecordTypeMessagePairs(db, prefix);
    const messagePairsById =
        new Map<Id, DocumentMessagePair[]>();
    for (const messagePair of messagePairs) {
        const list = messagePairsById.get(messagePair.name);
        if (list === undefined) {
            messagePairsById.set(
                messagePair.name, [messagePair],
            );
        } else {
            list.push(messagePair);
        }
    }
    const byId = new Map<Id, RecordTypeWireRow>();
    for (const [id, document] of documents) {
        const history = stateHistoryFrom(
            documentLifecycleEvents(
                messagePairsById.get(id) ?? [],
            ),
            id,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            continue;
        }
        byId.set(
            id,
            recordTypeEntityOf(document, organization),
        );
    }
    const live = await messageStore(db).getCollection(prefix);
    const rows: RecordTypeWireRow[] = [];
    for (const entity of live) {
        const row = byId.get(liveHeadId(entity));
        if (row !== undefined) rows.push(row);
    }
    return rows;
}

export async function deriveRecordTypeEntity(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<RecordTypeWireRow> {
    const prefix = recordTypesUriPrefix(organization);
    const { document, messagePairs } =
        await fetchRecordTypeDocumentMessagePairs(
            db, prefix, id,
        );
    if (document === undefined) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    const history = stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        id,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    return recordTypeEntityOf(document, organization);
}

// One row per distinct state_event_id — (state_at, id) ASC.
// Handler reverses for DESC on the wire. Empty history is a
// miss (handler maps via missedReadError).
export async function deriveRecordTypeStateHistory(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<StateEntity[]> {
    const prefix = recordTypesUriPrefix(organization);
    const { messagePairs } =
        await fetchRecordTypeDocumentMessagePairs(
            db, prefix, id,
        );
    return stateHistoryFrom(
        documentLifecycleEvents(messagePairs),
        id,
    );
}

export async function requireRecordTypeExists(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<void> {
    await deriveRecordTypeEntity(db, organization, id);
}
