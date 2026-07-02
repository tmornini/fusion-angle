import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedOrganizationMember } from './root-admin-fixture.ts';
import { ideaBody } from './test-fixtures.ts';

const BASE = 'http://localhost';
const MEMBER = 'walt';

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
        },
        ...(body === undefined
            ? {} : { body: JSON.stringify(body) }),
    });
}

async function memberDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationMember(db, MEMBER);
    return db;
}

test('a member reads and writes the content surfaces',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const put = await handleRequest(db, req(
        'PUT', '/ideas/i1', token, ideaBody('1', 'mine')));
    assert.equal(put.status, 200);
    const list = await handleRequest(
        db, req('GET', '/ideas', token));
    assert.equal(list.status, 200);
    const roster = await handleRequest(
        db, req('GET', '/members', token));
    assert.equal(roster.status, 200);
});

test('a member is denied the admin surfaces', async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    // snapshots/* are intentionally auth-free — a dev-tier
    // surface removed at the Postgres server tier — so they
    // are not probed here even though the policy table would
    // deny them.
    for (const [method, path] of [
        ['GET', '/memberships'],
        ['PUT', '/memberships/evil'],
        ['GET', '/identities'],
        ['GET', '/identity-pii'],
        ['PUT', '/organizations/1'],
        ['PUT', '/members/' + MEMBER],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, token,
            method === 'PUT' ? {} : undefined));
        assert.equal(
            res.status, 403, method + ' ' + path);
    }
    const grant = await handleRequest(db, req(
        'PUT', '/role-grants/evil', token, {
            organization_id: '1',
            identity_id: MEMBER, role: 'admin',
            action: 'granted', by_member_id: MEMBER,
            at: '2026-06-10T00:00:00.000000Z',
        }));
    assert.equal(grant.status, 403);
});
