// Pure classification of one ledger statement.
// Heads and the clock are arguments. No row is written.

import {
    NEVER_WRITTEN_IDENTIFIER,
    NIL_IDENTIFIER,
    uuidTextOfIdentifier,
} from './identifier.ts';
import {
    imfFixdate,
    laterStamp,
    leafHashHex,
    pairRootHex,
    secretsHashHex,
} from './pair-root.ts';

export type Attempt =
    | 'blind'
    | 'in-order'
    | 'composed';

export type Outcome = 'land' | 'matched' | 'stale';

export type StatementRow = {
    id: string,
    operationId: string,
    path: string,
    name: string,
    requesterIdentityId: string,
    method: string,
    request: Uint8Array,
    requestSalt: Uint8Array,
    requestSecrets: Uint8Array,
    responsePrefix: Uint8Array,
    responseSuffix: Uint8Array,
    responseSalt: Uint8Array,
    responseSecrets: Uint8Array,
    ifMatch: string | null,
};

export type StatementBind = StatementRow & {
    notify: string,
};

export type StatementAnswer = {
    id: string,
    path: string,
    name: string,
    method: string,
    outcome: Outcome,
    rawOutcome: Outcome,
    stamp: string,
    response: Uint8Array,
    headId: string | null,
    headResponse: Uint8Array | null,
    headMethod: string | null,
    inserted: boolean,
    supersedes: string,
    requestHashHex: string,
    requestSecretsHashHex: string,
    responseHashHex: string,
    responseSecretsHashHex: string,
    pairHashHex: string,
};

export type Head = {
    path: string,
    name: string,
    id: string,
    responseAt: string,
    response: Uint8Array,
    method: string,
};

export type ClassifiedRow = {
    outcome: Outcome,
    rawOutcome: Outcome,
    inserted: boolean,
    supersedes: string,
    stamp: string,
    response: Uint8Array,
    headId: string | null,
    headResponse: Uint8Array | null,
    headMethod: string | null,
    requestHashHex: string,
    requestSecretsHashHex: string,
    responseHashHex: string,
    responseSecretsHashHex: string,
    pairHashHex: string,
};

export type Refusal =
    | 'retry'
    | {
        status: number,
        error: string,
    };

const CONFLICT = 409;
const PRECONDITION_FAILED = 412;
const BLIND_ATTEMPTS = 3;
const CR = 13;
const LF = 10;

export async function classifyStatement(
    attempt: Attempt,
    rows: readonly StatementRow[],
    heads: readonly Head[],
    now: string,
): Promise<ClassifiedRow[]> {
    const prepared: Prepared[] = [];
    for (const row of rows) {
        const head = headFor(heads, row.path, row.name);
        const stamp = stampFor(attempt, head, now);
        const response = spliceResponse(
            overlaidPrefix(row, head),
            stamp,
            row.responseSuffix,
        );
        prepared.push({
            row,
            head,
            stamp,
            response,
            supersedes: supersedesOf(head),
            outcome: rawOutcome(row, head, response),
        });
    }
    const outcome = reportedOutcome(prepared);
    const classified: ClassifiedRow[] = [];
    for (const item of prepared) {
        classified.push(await hashedRow(
            item,
            outcome,
            isInserted(outcome, item.outcome),
        ));
    }
    return classified;
}

// A landing statement skips its matched rows, so a row is
// inserted only when both it and its statement land.
export function isInserted(
    outcome: Outcome,
    rawOutcome: Outcome,
): boolean {
    return outcome === 'land' && rawOutcome === 'land';
}

export function refusalOf(
    attempt: Attempt,
    conflicts: number,
    path: string,
    name: string,
): Refusal {
    const document = path + name;
    if (attempt === 'blind') {
        if (conflicts < BLIND_ATTEMPTS) {
            return 'retry';
        }
        return {
            status: CONFLICT,
            error: 'Document remained contended at '
                + document,
        };
    }
    return {
        status: PRECONDITION_FAILED,
        error: 'If-Match does not match the current'
            + ' document at ' + document,
    };
}

type Prepared = {
    row: StatementRow,
    head: Head | null,
    stamp: string,
    response: Uint8Array,
    supersedes: string,
    outcome: Outcome,
};

// The caller passes at most one head per document.
function headFor(
    heads: readonly Head[],
    path: string,
    name: string,
): Head | null {
    for (const head of heads) {
        if (head.path === path && head.name === name) {
            return head;
        }
    }
    return null;
}

function stampFor(
    attempt: Attempt,
    head: Head | null,
    now: string,
): string {
    if (attempt === 'blind' && head === null) {
        return now;
    }
    return laterStamp(
        now,
        head === null ? null : head.responseAt,
    );
}

function supersedesOf(head: Head | null): string {
    if (head === null) {
        return NIL_IDENTIFIER;
    }
    return head.id;
}

// A nil latch is a declared genesis: it may not land over
// a live document, and it never matches one. A
// never-written latch may not land over a tombstone either:
// the name is spent. Only a PUT or DELETE is a version of
// its document, so only it can match the head.
function rawOutcome(
    row: StatementRow,
    head: Head | null,
    response: Uint8Array,
): Outcome {
    if (row.ifMatch === NEVER_WRITTEN_IDENTIFIER) {
        return head === null ? 'land' : 'stale';
    }
    if (row.ifMatch === NIL_IDENTIFIER) {
        return head !== null && head.method === 'PUT'
            ? 'stale'
            : 'land';
    }
    if (
        row.ifMatch !== null
        && (head === null || head.id !== row.ifMatch)
    ) {
        return 'stale';
    }
    if (
        head !== null
        && (row.method === 'PUT' || row.method === 'DELETE')
        && sameBytes(
            bodyBytes(head.response),
            bodyBytes(response),
        )
    ) {
        return 'matched';
    }
    return 'land';
}

// Stale anywhere refuses the statement. A matched row is
// skipped, but with no landing document row the statement
// is a no-op: nothing is stored, the received pair too.
function reportedOutcome(
    prepared: readonly Prepared[],
): Outcome {
    if (prepared.some((item) => item.outcome === 'stale')) {
        return 'stale';
    }
    const matched = prepared.some(
        (item) => item.outcome === 'matched',
    );
    const documentLands = prepared.some(
        (item) => item.outcome === 'land' && isDocumentRow(item),
    );
    return matched && !documentLands ? 'matched' : 'land';
}

// A document row carries a latch; the received pair never
// does. A statement of blind rows has no document row, so
// one matched row stores nothing.
function isDocumentRow(item: Prepared): boolean {
    return item.row.ifMatch !== null;
}

function overlaidPrefix(
    row: StatementRow,
    head: Head | null,
): Uint8Array {
    if (
        row.method !== 'PUT'
        || head === null
        || head.method !== 'PUT'
    ) {
        return row.responsePrefix;
    }
    const prefix = row.responsePrefix.slice();
    prefix.set(new TextEncoder().encode('200'), 9);
    return prefix;
}

function spliceResponse(
    prefix: Uint8Array,
    stamp: string,
    suffix: Uint8Array,
): Uint8Array {
    const date = new TextEncoder().encode(
        imfFixdate(stamp),
    );
    const response = new Uint8Array(
        prefix.length + date.length + suffix.length,
    );
    response.set(prefix, 0);
    response.set(date, prefix.length);
    response.set(suffix, prefix.length + date.length);
    return response;
}

function bodyBytes(message: Uint8Array): Uint8Array {
    for (let at = 0; at + 3 < message.length; at++) {
        if (
            message[at] === CR
            && message[at + 1] === LF
            && message[at + 2] === CR
            && message[at + 3] === LF
        ) {
            return message.subarray(at + 4);
        }
    }
    return new Uint8Array(0);
}

function sameBytes(
    left: Uint8Array,
    right: Uint8Array,
): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let i = 0; i < left.length; i++) {
        if (left[i] !== right[i]) {
            return false;
        }
    }
    return true;
}

async function hashedRow(
    item: Prepared,
    outcome: Outcome,
    inserted: boolean,
): Promise<ClassifiedRow> {
    const requestHashHex = await leafHashHex(
        item.row.requestSalt,
        item.row.request,
    );
    const requestSecretsHashHex = await secretsHashHex(
        item.row.requestSecrets,
    );
    const responseHashHex = await leafHashHex(
        item.row.responseSalt,
        item.response,
    );
    const responseSecretsHashHex = await secretsHashHex(
        item.row.responseSecrets,
    );
    const pairHashHex = await pairRootHex({
        id: uuidTextOfIdentifier(item.row.id),
        operationId: uuidTextOfIdentifier(
            item.row.operationId,
        ),
        path: item.row.path,
        name: item.row.name,
        supersedes: uuidTextOfIdentifier(item.supersedes),
        requesterIdentityId: item.row.requesterIdentityId,
        method: item.row.method,
        responseAt: item.stamp,
        requestHashHex,
        requestSecretsHashHex,
        responseHashHex,
        responseSecretsHashHex,
    });
    return {
        outcome,
        rawOutcome: item.outcome,
        inserted,
        supersedes: item.supersedes,
        stamp: item.stamp,
        response: item.response,
        headId: item.head === null ? null : item.head.id,
        headResponse: item.head === null
            ? null
            : item.head.response.slice(),
        headMethod: item.head === null
            ? null
            : item.head.method,
        requestHashHex,
        requestSecretsHashHex,
        responseHashHex,
        responseSecretsHashHex,
        pairHashHex,
    };
}
