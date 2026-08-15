import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    parseAndValidateSnapshot,
} from '../api/snapshot-validator.ts';

const WIRE_REQUEST =
    'PUT /organizations/1/ideas/42 HTTP/1.1\r\n\r\n';
const WIRE_RESPONSE =
    'HTTP/1.1 204 No Content\r\n\r\n';
const AT = '2026-01-01T00:00:00.000000Z';
const OPERATION_ID = '0123456789ABCDEFGHIJKL';

function currentRequestRow(): Record<string, unknown> {
    return {
        id: 'rq1',
        uri_collection: '/organizations/1/ideas/',
        uri_id: '42',
        at: AT,
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: WIRE_REQUEST,
        method: 'PUT',
        operation_id: OPERATION_ID,
    };
}

function currentResponseRow(): Record<string, unknown> {
    return {
        id: 'rs1',
        uri_collection: '/organizations/1/ideas/',
        uri_id: '42',
        at: AT,
        version: 'e'.repeat(64),
        message: WIRE_RESPONSE,
        operation_id: OPERATION_ID,
    };
}

function omit(
    row: Record<string, unknown>,
    key: string,
): Record<string, unknown> {
    const { [key]: _dropped, ...rest } = row;
    return rest;
}

function refuses(
    json: string,
    field: RegExp,
): void {
    assert.throws(
        () => parseAndValidateSnapshot(json),
        (err: unknown) =>
            err instanceof Error
            && field.test(err.message)
            && /Re-snapshot|reseed/.test(
                err.message,
            ),
    );
}

const legacyRequestRow = omit(
    currentRequestRow(), 'operation_id',
);
const legacyResponseRow = omit(
    currentResponseRow(), 'operation_id',
);

test('snapshot without operation_id is refused',
() => {
    refuses(
        JSON.stringify({
            requests: [legacyRequestRow],
            responses: [legacyResponseRow],
        }),
        /operation_id/,
    );
});

test('snapshot with at not 6-digit zulu is refused',
() => {
    refuses(
        JSON.stringify({
            requests: [
                currentRequestRow(),
            ],
            responses: [{
                ...currentResponseRow(),
                at: '2026-01-01T00:00:00Z',
            }],
        }),
        /zulu|timestamp|at/,
    );
});

const jsonWithStartLine = JSON.stringify({
    requests: [{
        ...currentRequestRow(),
        message: JSON.stringify({
            startLine: {
                kind: 'request',
                method: 'PUT',
                target: '/organizations/1/ideas/42',
                version: 'HTTP/1.1',
            },
        }),
    }],
});

test('snapshot with canonical-JSON message is refused',
() => {
    refuses(
        jsonWithStartLine,
        /serializeWire|message/,
    );
});

test(
    'snapshot with message lacking CRLFCRLF is refused',
    () => {
        refuses(
            JSON.stringify({
                requests: [{
                    ...currentRequestRow(),
                    message: '{"kind":"request"}',
                }],
            }),
            /serializeWire|message/,
        );
    },
);

test('snapshot without uri_collection is refused',
() => {
    const prefixOnly = omit(
        currentRequestRow(), 'uri_collection',
    );
    refuses(
        JSON.stringify({
            requests: [{
                ...prefixOnly,
                uri_prefix:
                    '/organizations/1/ideas/',
            }],
        }),
        /uri_collection/,
    );
});
