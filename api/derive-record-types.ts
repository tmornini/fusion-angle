import type { DbAdapter } from './db.ts';
import { missedReadError } from './derive-states.ts';
import type { Id, StateEntity } from './types.ts';
import { pickString, pickNumber } from './validators.ts';
import {
    documentMessagePairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    headDocumentOf,
    documentIsTombstone,
    type DerivedDocument,
    type DocumentMessagePair,
} from './derive-documents.ts';
import { messageStore } from './message-store.ts';

// Org-nested record-types derive surface: head reads, the
// same primitives as document-family.

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

async function fetchRecordTypeDocumentMessagePairs(
    db: DbAdapter,
    prefix: string,
    id: Id,
): Promise<{
    readonly messagePairs: readonly DocumentMessagePair[];
}> {
    const history = await db.messagePairs.getDocumentHistory(
        prefix, id,
    );
    return {
        messagePairs: documentMessagePairsAt(history, prefix),
    };
}

export async function deriveRecordTypeCollection(
    db: DbAdapter,
    organization: Id,
): Promise<RecordTypeWireRow[]> {
    const prefix = recordTypesUriPrefix(organization);
    const heads = await db.messagePairs.getCollectionHeadPairs(
        prefix,
    );
    const rows: RecordTypeWireRow[] = [];
    for (const head of heads) {
        const document = headDocumentOf(head);
        if (documentIsTombstone(document)) continue;
        rows.push(recordTypeEntityOf(document, organization));
    }
    return rows;
}

export async function deriveRecordTypeEntity(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<RecordTypeWireRow> {
    const prefix = recordTypesUriPrefix(organization);
    const head = await messageStore(db).getDocumentHead(
        prefix, id,
    );
    if (head === null) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    const document = headDocumentOf(head);
    if (documentIsTombstone(document)) {
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
