import type { DbAdapter } from './db.ts';
import { missedReadError } from './derive-states.ts';
import type {
    Id,
    MessagePairEntity,
} from '../shared/types.ts';
import { pickString, pickNumber } from './validators.ts';
import {
    headDocumentOf,
    documentIsTombstone,
    type DerivedDocument,
} from './derive-documents.ts';
import { messageStore } from './message-store.ts';

// Org-nested record-types derive surface: head reads, the
// same primitives as document-family.

export const RECORD_TYPES_TABLE = 'record_types';

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

// The live type's head: the composed edit latches on it and
// a nested read or write requires it. No head, or a
// tombstone, is a miss.
export async function recordTypeHeadFor(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<MessagePairEntity> {
    const prefix = recordTypesUriPrefix(organization);
    const head = await messageStore(db).getDocumentHead(
        prefix, id,
    );
    if (
        head === null
        || documentIsTombstone(headDocumentOf(head))
    ) {
        throw await missedReadError(
            db, id, organization, RECORD_TYPES_TABLE,
        );
    }
    return head;
}

export async function deriveRecordTypeEntity(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<RecordTypeWireRow> {
    return recordTypeEntityOf(
        headDocumentOf(
            await recordTypeHeadFor(db, organization, id),
        ),
        organization,
    );
}

export async function requireRecordTypeExists(
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<void> {
    await deriveRecordTypeEntity(db, organization, id);
}
