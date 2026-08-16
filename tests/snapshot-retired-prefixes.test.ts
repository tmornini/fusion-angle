// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    parseAndValidateSnapshot,
} from '../api/snapshot-validator.ts';
import { ValidationError } from '../api/types.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    devToken, organizationToken,
} from './token-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import {
    getSnapshot,
    putSnapshot,
    scanForRetiredKeys,
    SnapshotIncompatibleError,
} from '../web-app/app/adapters/snapshots.ts';
import { seededMockDb } from './mock-seed.ts';

const LEGACY_RECORDS_PREFIX =
    '/organizations/1/records/';
const LEGACY_RECORD_ATTRIBUTES_PREFIX =
    '/organizations/1/record-attributes/';
const LIVE_FLOW_RECORDS_PREFIX =
    '/organizations/1/flows/f1/records/';

function requestRow(uriCollection: string) {
    return {
        id: 'rq1',
        uri_collection: uriCollection,
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message:
            'PUT /organizations/1/ideas/42'
            + ' HTTP/1.1\r\n\r\n',
        method: 'PUT',
        operation_id: '0123456789ABCDEFGHIJKL',
    };
}

function responseRow(uriCollection: string) {
    return {
        id: 'rs1',
        uri_collection: uriCollection,
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        version: 'e'.repeat(64),
        message:
            'HTTP/1.1 204 No Content\r\n\r\n',
        operation_id: '0123456789ABCDEFGHIJKL',
    };
}

function snapshotJson(
    table: 'requests' | 'responses',
    uriCollection: string,
): string {
    const row = table === 'requests'
        ? requestRow(uriCollection)
        : responseRow(uriCollection);
    return JSON.stringify({ [table]: [row] });
}

// -- Server gate: parseAndValidateSnapshot

test(
    'parseAndValidateSnapshot rejects requests row with'
    + ' retired flat records uri_collection via'
    + ' ValidationError',
    () => {
        const json = snapshotJson(
            'requests', LEGACY_RECORDS_PREFIX,
        );
        assert.throws(
            () => parseAndValidateSnapshot(json),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    LEGACY_RECORDS_PREFIX,
                )
                && err.message.includes('retired'),
        );
    },
);

test(
    'parseAndValidateSnapshot rejects responses row with'
    + ' retired flat records uri_collection via'
    + ' ValidationError',
    () => {
        const json = snapshotJson(
            'responses', LEGACY_RECORDS_PREFIX,
        );
        assert.throws(
            () => parseAndValidateSnapshot(json),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    LEGACY_RECORDS_PREFIX,
                )
                && err.message.includes('retired'),
        );
    },
);

test(
    'parseAndValidateSnapshot accepts flows/:id/records'
    + ' join prefix (anchored predicate)',
    () => {
        const json = snapshotJson(
            'requests', LIVE_FLOW_RECORDS_PREFIX,
        );
        const result = parseAndValidateSnapshot(json);
        const rows = result.get('requests');
        assert.ok(rows);
        assert.equal(rows.length, 1);
        assert.equal(
            (rows[0] as { uri_collection: string })
                .uri_collection,
            LIVE_FLOW_RECORDS_PREFIX,
        );
    },
);

test(
    'parseAndValidateSnapshot rejects requests row with'
    + ' retired flat record-attributes uri_collection via'
    + ' ValidationError',
    () => {
        const json = snapshotJson(
            'requests', LEGACY_RECORD_ATTRIBUTES_PREFIX,
        );
        assert.throws(
            () => parseAndValidateSnapshot(json),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    LEGACY_RECORD_ATTRIBUTES_PREFIX,
                )
                && err.message.includes('retired'),
        );
    },
);

test(
    'parseAndValidateSnapshot rejects responses row with'
    + ' retired flat record-attributes uri_collection via'
    + ' ValidationError',
    () => {
        const json = snapshotJson(
            'responses', LEGACY_RECORD_ATTRIBUTES_PREFIX,
        );
        assert.throws(
            () => parseAndValidateSnapshot(json),
            (err: unknown) =>
                err instanceof ValidationError
                && err.message.includes(
                    LEGACY_RECORD_ATTRIBUTES_PREFIX,
                )
                && err.message.includes('retired'),
        );
    },
);

// -- Wire: ValidationError → 400 (not bare Error → 500)

test(
    'PUT snapshots/import with a legacy records prefix'
    + ' answers 400 house body, not 500',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const json = snapshotJson(
            'requests', LEGACY_RECORDS_PREFIX,
        );
        const res = await handleRequest(
            db,
            new Request(
                'http://localhost/snapshots/import',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type':
                            'application/json',
                        'Authorization':
                            'Bearer '
                            + await organizationToken(),
                        'Operation-ID':
                            TEST_OPERATION_ID,
                    },
                    body: JSON.stringify({ json }),
                },
            ),
        );
        assert.equal(res.status, 400);
        const body = await res.json() as {
            error: string;
        };
        assert.ok(
            typeof body.error === 'string'
            && body.error.includes(
                LEGACY_RECORDS_PREFIX,
            ),
            'house body must name the retired prefix',
        );
        assert.notEqual(
            body.error, 'internal error',
            'must not collapse to 500 house body',
        );
    },
);

// -- Client pre-flight: scanForRetiredKeys / putSnapshot

test(
    'scanForRetiredKeys lists legacy records uri_collection'
    + ' on requests',
    () => {
        const findings = scanForRetiredKeys({
            requests: [
                requestRow(LEGACY_RECORDS_PREFIX),
            ],
        });
        assert.ok(
            findings.includes(
                'requests[].uri_collection='
                + LEGACY_RECORDS_PREFIX,
            ),
        );
    },
);

test(
    'scanForRetiredKeys does not flag flows/:id/records'
    + ' join prefix',
    () => {
        const findings = scanForRetiredKeys({
            requests: [
                requestRow(LIVE_FLOW_RECORDS_PREFIX),
            ],
        });
        assert.deepEqual(findings, []);
    },
);

test(
    'scanForRetiredKeys lists legacy record-attributes'
    + ' uri_collection on requests',
    () => {
        const findings = scanForRetiredKeys({
            requests: [
                requestRow(
                    LEGACY_RECORD_ATTRIBUTES_PREFIX,
                ),
            ],
        });
        assert.ok(
            findings.includes(
                'requests[].uri_collection='
                + LEGACY_RECORD_ATTRIBUTES_PREFIX,
            ),
        );
    },
);

test(
    'putSnapshot with a legacy records prefix throws'
    + ' SnapshotIncompatibleError listing the finding',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const ctx = createRequestContext(
            db, await devToken(),
        );
        const json = snapshotJson(
            'requests', LEGACY_RECORDS_PREFIX,
        );
        await assert.rejects(
            () => putSnapshot(ctx, json),
            (err: unknown) =>
                err instanceof
                    SnapshotIncompatibleError
                && err.retired.includes(
                    'requests[].uri_collection='
                    + LEGACY_RECORDS_PREFIX,
                ),
        );
    },
);

// -- Mock seed export still round-trips both gates

test(
    'current mock seed export round-trips through'
    + ' both snapshot gates',
    async () => {
        const db = await seededMockDb();
        const ctx = createRequestContext(
            db, await devToken(),
        );
        const json = await getSnapshot(ctx);
        // Client pre-flight + server universal gate both
        // run inside putSnapshot.
        await putSnapshot(ctx, json);
        const again = await getSnapshot(ctx);
        assert.deepEqual(
            JSON.parse(again),
            JSON.parse(json),
        );
    },
);
