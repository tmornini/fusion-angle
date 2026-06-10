import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

// Verify-first (Correction C): facadeRequest forwards POST
// bodies and re-enters the gate against the org-scoped
// `effective` adapter, so a records-multi-put POST through
// the facade is org-fenced exactly like a flat PUT. These
// pin that behavior; no facade code is added unless red.

const BASE = 'http://localhost';

function req(
    method: string, path: string,
    token: string, body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// An edit multi-put puts only the record row — the path
// that isolates the org stamp from the create-path member
// and initial-state writes.
function editBody(org: string) {
    return {
        kind: 'edit',
        id: 'rec-1',
        record: {
            organization_id: org,
            name: 'rec', description: 'd', position: 0,
        },
        attributes: [],
        removedAttributeIds: [],
    };
}

// `current` holds admin in org A (the administered org) and
// is a member of org A only. Roles are per-org since Phase 3,
// so the org-A grant authorizes the facade write.
async function oneOrg(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.roleGrants.put('role-current-admin-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await db.memberships.put('m-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    return db;
}

test('a facade records-multi-put stamps the bound org'
    + ' over a forged record', async () => {
    const db = await oneOrg();
    const res = await handleRequest(db, req(
        'POST', '/organizations/A/records-multi-put',
        await devToken('current'),
        editBody('B')));
    assert.equal(res.status, 204);
    const stored = await db.records.getById('rec-1');
    assert.equal(stored.organization_id, 'A');
});

test('a facade records-multi-put into a non-member org'
    + ' is 403', async () => {
    const db = await oneOrg();
    const res = await handleRequest(db, req(
        'POST', '/organizations/B/records-multi-put',
        await devToken('current'),
        editBody('B')));
    assert.equal(res.status, 403);
});
