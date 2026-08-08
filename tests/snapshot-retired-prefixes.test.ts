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
import { devToken } from './token-fixtures.ts';
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

function requestRow(uriPrefix: string) {
    return {
        id: 'rq1',
        uri_prefix: uriPrefix,
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: '{"kind":"request"}',
    };
}

function responseRow(uriPrefix: string) {
    return {
        id: 'rs1',
        uri_prefix: uriPrefix,
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        status: 200,
        etag: 'e'.repeat(64),
        message_hash: 'b'.repeat(64),
        message: '{"kind":"response"}',
    };
}

function snapshotJson(
    table: 'requests' | 'responses',
    uriPrefix: string,
): string {
    const row = table === 'requests'
        ? requestRow(uriPrefix)
        : responseRow(uriPrefix);
    return JSON.stringify({ [table]: [row] });
}

// -- Server gate: parseAndValidateSnapshot

test(
    'parseAndValidateSnapshot rejects requests row with'
    + ' retired flat records uri_prefix via'
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
    + ' retired flat records uri_prefix via'
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
            (rows[0] as { uri_prefix: string })
                .uri_prefix,
            LIVE_FLOW_RECORDS_PREFIX,
        );
    },
);

test(
    'parseAndValidateSnapshot rejects requests row with'
    + ' retired flat record-attributes uri_prefix via'
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
    + ' retired flat record-attributes uri_prefix via'
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
    'scanForRetiredKeys lists legacy records uri_prefix'
    + ' on requests',
    () => {
        const findings = scanForRetiredKeys({
            requests: [
                requestRow(LEGACY_RECORDS_PREFIX),
            ],
        });
        assert.ok(
            findings.includes(
                'requests[].uri_prefix='
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
    + ' uri_prefix on requests',
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
                'requests[].uri_prefix='
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
                    'requests[].uri_prefix='
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
