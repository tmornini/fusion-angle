import type { DbAdapter } from './db.ts';
import {
    assertInvitationState,
    type Id,
    type InvitationState,
} from './types.ts';
import { pickString } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The invitation family's reduction over the message ledger.
// An invitation is ONE document: `path = /invitations/`,
// `name = <id>`, body = organization_id, identity_id, at,
// state. The grant PUTs it 'pending'; accept, decline, and
// revoke each PUT it again with the terminal state
// (api/invitations-domain.ts). The head IS the state: the
// list is one collection read, one invitation is one
// document read — no op-prefix scan, no whole-ledger read
// (spec 2026-09-15 exact-read folds § 2).

const INVITATIONS_PREFIX = canonicalPath(
    undefined, '/invitations/',
);

export interface DerivedInvitationRow {
    readonly id: Id;
    readonly organization_id: Id;
    readonly identity_id: Id;
    readonly at: string;
    readonly state: InvitationState;
}

function invitationRowOf(
    document: DerivedDocument,
): DerivedInvitationRow {
    return {
        id: document.name,
        organization_id: pickString(
            document.body, 'organization_id',
        ),
        identity_id: pickString(document.body, 'identity_id'),
        at: pickString(document.body, 'at'),
        state: assertInvitationState(
            pickString(document.body, 'state'),
            'invitation ' + document.name,
        ),
    };
}

// The collection read: every live invitation head, id-lex.
export async function deriveInvitations(
    db: DbAdapter,
): Promise<DerivedInvitationRow[]> {
    const messagePairs = await db.messagePairs.getCollectionPairs(
        INVITATIONS_PREFIX,
    );
    const documents = deriveDocumentsAt(
        messagePairs, INVITATIONS_PREFIX,
    );
    const rows: DerivedInvitationRow[] = [];
    for (const document of documents.values()) {
        rows.push(invitationRowOf(document));
    }
    return rows.sort(byIdAscending);
}

// The document read: one invitation's head, or undefined
// when no document was ever written at this id. dbOrView-
// shaped and opens no nested transaction — callable from
// within an open write-gate transaction.
export async function deriveInvitation(
    dbOrView: DbAdapter,
    id: Id,
): Promise<DerivedInvitationRow | undefined> {
    const history = await dbOrView.messagePairs.getDocumentHistory(
        INVITATIONS_PREFIX, id,
    );
    const document = deriveDocumentsAt(
        history, INVITATIONS_PREFIX,
    ).get(id);
    return document === undefined
        ? undefined
        : invitationRowOf(document);
}
