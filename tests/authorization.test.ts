import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentRolesForInOrg, isPermitted,
} from '../api/authorization.ts';

const grant = (
    id: string, identity: string, role: string,
    action: 'granted' | 'revoked', at: string,
    org: string,
) => ({
    id, organization_id: org, identity_id: identity,
    role, action, by_member_id: 'system', at,
});

test('a granted role with no later revoke is held', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrg(rows, 'current', 'A'),
        ['admin']);
});

test('latest action per (identity, role) wins', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z', 'A'),
        grant('2', 'current', 'admin', 'revoked',
            '2026-02-01T00:00:00.000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrg(rows, 'current', 'A'), []);
});

test('roles are isolated per identity', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrg(rows, 'other', 'A'), []);
});

test('roles are isolated per org', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrg(rows, 'current', 'A'),
        ['admin']);
    assert.deepEqual(
        currentRolesForInOrg(rows, 'current', 'B'), []);
});

test('a same-instant revoke beats the grant', () => {
    const at = '2026-03-01T00:00:00.000Z';
    assert.deepEqual(
        currentRolesForInOrg([
            grant('1', 'current', 'admin', 'granted',
                at, 'A'),
            grant('2', 'current', 'admin', 'revoked',
                at, 'A'),
        ], 'current', 'A'),
        []);
});

test('a same-instant re-grant beats the revoke', () => {
    const at = '2026-03-01T00:00:00.000Z';
    assert.deepEqual(
        currentRolesForInOrg([
            grant('1', 'current', 'admin', 'revoked',
                at, 'A'),
            grant('2', 'current', 'admin', 'granted',
                at, 'A'),
        ], 'current', 'A'),
        ['admin']);
});

test('admin is permitted on every verb at root', () => {
    for (const verb of ['GET', 'PUT', 'POST', 'DELETE']) {
        assert.equal(
            isPermitted(verb, '/role-grants/x', ['admin']),
            true);
        assert.equal(
            isPermitted(verb, '/members', ['admin']), true);
    }
});

test('deny-by-default: no held role is forbidden', () => {
    assert.equal(isPermitted('GET', '/members', []), false);
    assert.equal(
        isPermitted('GET', '/members', ['viewer']), false);
});
