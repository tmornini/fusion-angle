import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

// Pins the CURRENT status of every deliberate flows-family
// verb gap, through handleRequest, so the third-family
// absorption (api/document-family.ts) cannot silently move
// one — the generic constructors replace
// organizations/:id/ideas|projects route scaffolding,
// never organizations/:id/flows/:id (Task 3 flips
// flows), but a gate-level regression could still
// shift these. A future change to any of these five
// statuses must re-derive the covenant deliberately,
// not by accident of refactoring.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('DELETE organizations/:id/flows/:id 405s (no delete handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('DELETE'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ', token),
    );
    assert.equal(res.status, 405);
});

// Task 10: PATCH alphabet — no flows-family patch yet.
test('PATCH organizations/:id/flows/:id 405s (no patch handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ', token, {},
    ));
    assert.equal(res.status, 405);
});

// POST organizations/:id/flows/:id/versions/:vid verb-gap RETIRED with the
// versions routes (Phase 15 Task 7) — router 404, not 405.

test('GET organizations/:id/projects/:id/flows/:pfid 405s (no get handler'
+ ' wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(
        db, req('GET'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
            + 'pnXmXrxOWayANgDLdCjuBw/flows/qXdXbgQMkiANkXUSvLPFiQ', token),
    );
    assert.equal(res.status, 405);
});

test('DELETE organizations/:id/flows/:id/work-orders/:woid 405s (no delete'
+ ' handler wired)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/work-orders/yNSSnbrpacodQTzUEcdEVA'
            , token,
    ));
    assert.equal(res.status, 405);
});

test('PUT organizations/:id/flows/:id/undo 405s (no put handler wired)',
async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/undo', token, {},
    ));
    assert.equal(res.status, 405);
});

// Task 4 (R1/E5): redo folds into the locked save — the
// POST /organizations/:id/flows/:id/redo route leaves the URI tree entirely,
// so a request against it now finds no matching pattern at
// all (404), not a method-absent 405 against a still-live
// segment. Additive pin: today (pre-fold) this same request
// still 204s.
test('POST organizations/:id/flows/:id/redo 404s (route retired; redo now'
+ ' rides client document-PUT only)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'ZOousbbnzpqlxJExVAruYQ/redo', token, {
            version: {
                id: 'ver-redo',
                version: {
                    flow_id: 'ZOousbbnzpqlxJExVAruYQ',
                    name: 'redo-snap',
                    is_locked: false,
                    is_auto_layout: false,
                    is_auto_fit: false,
                    lock_timeout: DEFAULT_LOCK_TIMEOUT,
                    graph: {
                        nodes: [], edges: [],
                    },
                    at: '2026-01-01T00:00:00.000000Z',
                },
                trimIds: [],
            },
            flow: {
                name: 'redone',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            eventId: 'redo-ev',
            at: '2026-01-01T00:00:00.000000Z',
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
            revivals: [],
        },
    ));
    assert.equal(res.status, 404);
});
