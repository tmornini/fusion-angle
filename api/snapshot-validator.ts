import { TABLE_NAMES } from './db.ts';
import { extractErrorMessage } from '../shared/error-helpers.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { ValidationError } from './types.ts';
import {
    validateRequestEntity,
    validateResponseEntity,
} from './validators.ts';

// Same width as validators.ts ISO_ZULU. Pre-break
// snapshots used fractionless or 3-digit stamps.
const ISO_ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const RESEED =
    ' Re-snapshot from current state or reseed.';

function whereRow(
    table: string,
    rowIndex: number,
): string {
    return 'row ' + rowIndex
        + ' in table "' + table + '"';
}

function refusePreBreak(
    message: string,
): never {
    throw new ValidationError(message + RESEED);
}

// Pre-break rows fail these even when the entity
// validator would already throw — operators must
// see Re-snapshot / reseed.
function refusePreBreakKeys(
    row: Record<string, unknown>,
    table: string,
    rowIndex: number,
): void {
    const where = whereRow(table, rowIndex);
    if (!('operation_id' in row)) {
        refusePreBreak(
            'Invalid snapshot: ' + where
            + ' is missing operation_id.',
        );
    }
    if (!('uri_collection' in row)) {
        refusePreBreak(
            'Invalid snapshot: ' + where
            + ' is missing uri_collection.',
        );
    }
    const at = row['at'];
    if (
        typeof at !== 'string'
        || !ISO_ZULU_6.test(at)
    ) {
        refusePreBreak(
            'Invalid snapshot: ' + where
            + ' at is not 6-digit zulu.',
        );
    }
}

function isCanonicalJsonMessage(
    message: string,
): boolean {
    try {
        const parsed = JSON.parse(message);
        return typeof parsed === 'object'
            && parsed !== null
            && !Array.isArray(parsed)
            && 'startLine' in parsed;
    } catch {
        return false;
    }
}

function isSerializeWire(message: string): boolean {
    try {
        parseWire(message);
        return true;
    } catch {
        return false;
    }
}

function refusePreBreakMessage(
    row: Record<string, unknown>,
    table: string,
    rowIndex: number,
): void {
    const where = whereRow(table, rowIndex);
    const message = row['message'];
    if (
        typeof message !== 'string'
        || isCanonicalJsonMessage(message)
        || !isSerializeWire(message)
    ) {
        refusePreBreak(
            'Invalid snapshot: ' + where
            + ' message is not serializeWire.',
        );
    }
}

// Anchored retired message-plane uri_collection patterns.
// Task 5: flat records. Task 8: flat record-attributes.
// Anchored so the live flows/:id/records join family is
// accepted (never a substring match).
const RETIRED_URI_PREFIX_PATTERNS:
    readonly RegExp[] = [
    /^\/organizations\/[^/]+\/records\//,
    /^\/organizations\/[^/]+\/record-attributes\//,
];

// Map table name → entity validator. Stored rows
// carry `id` as their storage key — strip it before
// passing to each validator, which enforces an exact
// body-key set.
function validateSnapshotRow(
    table: string,
    row: Record<string, unknown>,
    rowIndex: number,
): void {
    const label =
        'snapshot.' + table
        + '[' + rowIndex + ']';
    const { id: _id, ...body } = row;
    try {
        switch (table) {
            case 'requests':
                validateRequestEntity(body);
                break;
            case 'responses':
                validateResponseEntity(body);
                break;
        }
    } catch (err) {
        const msg = extractErrorMessage(err);
        throw new Error(
            'Invalid snapshot row in '
            + label + ': ' + msg,
        );
    }
}

// Parses + validates the snapshot JSON, returning
// per-table parsed rows. Throws with a precise
// message identifying which table or row failed.
// Unknown top-level keys (including a legacy
// `__schema_version__` marker) are ignored.
// Retired-prefix findings throw ValidationError so
// the wire answers 400 (api/api.ts house body).
export function parseAndValidateSnapshot(
    json: string,
): Map<string, { id: string }[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error(
            'Invalid snapshot: not valid JSON.',
        );
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        throw new Error(
            'Invalid snapshot: expected an object'
            + ' with table keys.',
        );
    }
    const record = parsed as Record<string, unknown>;
    const result = new Map<string, { id: string }[]>();
    for (const table of TABLE_NAMES) {
        const rows = record[table];
        if (
            rows !== undefined
            && !Array.isArray(rows)
        ) {
            throw new Error(
                'Invalid snapshot: table "'
                + table + '" is not an array.',
            );
        }
        const rowArr =
            Array.isArray(rows) ? rows : [];
        const parsedRows: { id: string }[] = [];
        for (let i = 0; i < rowArr.length; i++) {
            const row = rowArr[i];
            if (
                typeof row !== 'object'
                || row === null
                || Array.isArray(row)
            ) {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table + '" is not an object.',
                );
            }
            const r = row as Record<string, unknown>;
            refusePreBreakKeys(r, table, i);
            validateSnapshotRow(table, r, i);
            refusePreBreakMessage(r, table, i);
            const prefix = r['uri_collection'];
            if (typeof prefix === 'string') {
                for (
                    const p of RETIRED_URI_PREFIX_PATTERNS
                ) {
                    if (p.test(prefix)) {
                        throw new ValidationError(
                            'Invalid snapshot: row '
                            + i
                            + ' in table "'
                            + table
                            + '" carries retired'
                            + ' uri_collection '
                            + prefix
                            + '. Re-snapshot from'
                            + ' current state.',
                        );
                    }
                }
            }
            if (typeof r['id'] !== 'string') {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table
                    + '" missing string id.',
                );
            }
            parsedRows.push(r as { id: string });
        }
        result.set(table, parsedRows);
    }
    return result;
}
