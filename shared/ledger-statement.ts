// Pure classification of one ledger statement.
// Heads and the clock are arguments. No row is written.

import {
    NIL_IDENTIFIER,
    uuidTextOfIdentifier,
} from './identifier.ts';
import {
    imfFixdate,
    laterStamp,
    leafHashHex,
    pairRootHex,
    secretHashHex,
} from './pair-root.ts';

export type Attempt =
    | 'genesis'
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
    secret: Uint8Array,
    responsePrefix: Uint8Array,
    responseSuffix: Uint8Array,
    responseSalt: Uint8Array,
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
    stamp: string,
    response: Uint8Array,
    headId: string | null,
    headResponse: Uint8Array | null,
    inserted: boolean,
    supersedes: string,
    requestHashHex: string,
    secretHashHex: string,
    responseHashHex: string,
    pairHashHex: string,
};

export type Head = {
    path: string,
    name: string,
    id: string,
    responseAt: string,
    response: Uint8Array,
};

export type ClassifiedRow = {
    outcome: Outcome,
    inserted: boolean,
    supersedes: string,
    stamp: string,
    response: Uint8Array,
    headId: string | null,
    headResponse: Uint8Array | null,
    requestHashHex: string,
    secretHashHex: string,
    responseHashHex: string,
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
            row.responsePrefix,
            stamp,
            row.responseSuffix,
        );
        prepared.push({
            row,
            head,
            stamp,
            response,
            supersedes: supersedesOf(attempt, head),
            outcome: rawOutcome(
                attempt, row, head, response,
            ),
        });
    }
    const outcome = reportedOutcome(prepared);
    const inserted = outcome === 'land';
    const classified: ClassifiedRow[] = [];
    for (const item of prepared) {
        classified.push(await hashedRow(
            item, outcome, inserted,
        ));
    }
    return classified;
}

export function refusalOf(
    attempt: Attempt,
    conflicts: number,
    path: string,
    name: string,
): Refusal {
    const document = path + name;
    if (attempt === 'genesis') {
        return {
            status: CONFLICT,
            error: 'Document already exists at '
                + document,
        };
    }
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
    if (
        attempt === 'genesis'
        || (attempt === 'blind' && head === null)
    ) {
        return now;
    }
    return laterStamp(
        now,
        head === null ? null : head.responseAt,
    );
}

function supersedesOf(
    attempt: Attempt,
    head: Head | null,
): string {
    if (attempt === 'genesis' || head === null) {
        return NIL_IDENTIFIER;
    }
    return head.id;
}

function rawOutcome(
    attempt: Attempt,
    row: StatementRow,
    head: Head | null,
    response: Uint8Array,
): Outcome {
    if (attempt === 'genesis') {
        return 'land';
    }
    if (
        row.ifMatch !== null
        && (head === null || head.id !== row.ifMatch)
    ) {
        return 'stale';
    }
    if (
        head !== null
        && sameBytes(
            bodyBytes(head.response),
            bodyBytes(response),
        )
    ) {
        return 'matched';
    }
    return 'land';
}

function reportedOutcome(
    prepared: readonly Prepared[],
): Outcome {
    let outcome: Outcome = 'land';
    for (const item of prepared) {
        if (item.outcome === 'stale') {
            return 'stale';
        }
        if (item.outcome === 'matched') {
            outcome = 'matched';
        }
    }
    return outcome;
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
    const secretHash = await secretHashHex(item.row.secret);
    const responseHashHex = await leafHashHex(
        item.row.responseSalt,
        item.response,
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
        secretHashHex: secretHash,
        responseHashHex,
    });
    return {
        outcome,
        inserted,
        supersedes: item.supersedes,
        stamp: item.stamp,
        response: item.response,
        headId: item.head === null ? null : item.head.id,
        headResponse: item.head === null
            ? null
            : item.head.response.slice(),
        requestHashHex,
        secretHashHex: secretHash,
        responseHashHex,
        pairHashHex,
    };
}
