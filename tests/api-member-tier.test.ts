import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken } from './token-fixtures.ts';
import { seedOrgMember } from './root-admin-fixture.ts';
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
    await seedOrgMember(db, MEMBER);
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
    // snapshots/* stay bearer-exempt until the F-006 fix
    // narrows the bootstrap plane, so they are not probed
    // here even though the policy already denies them.
    for (const [method, path] of [
        ['GET', '/memberships'],
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

test('a member commit batch carries content ops',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST', '/commit', token, {
            ops: [{
                method: 'put',
                resource: 'ideas/i2',
                body: { id: 'i2', ...ideaBody('1', 'ok') },
            }],
        }));
    assert.equal(res.status, 204);
    const ideas = await db.ideas.getAll();
    assert.equal(ideas.length, 1);
});

test('a member cannot smuggle an admin op through commit',
async () => {
    const db = await memberDb();
    const token = await devToken(MEMBER);
    const res = await handleRequest(db, req(
        'POST', '/commit', token, {
            ops: [{
                method: 'put',
                resource: 'memberships/evil',
                body: {
                    organization_id: '1',
                    identity_id: 'intruder',
                    at: '2026-06-10T00:00:00.000000Z',
                },
            }],
        }));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.match(
        body.error,
        /commit op PUT \/memberships\/evil/);
    const rows = await db.memberships.getAll();
    assert.equal(
        rows.length, 1,
        'the smuggled membership must not land');
});
