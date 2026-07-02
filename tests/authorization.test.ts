import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentRolesForInOrganization, isPermitted,
    matchesOnSegmentBoundary,
} from '../api/authorization.ts';

test('a :id segment in a prefix matches any path segment',
() => {
    assert.equal(
        matchesOnSegmentBoundary(
            '/flows/f1/versions/v1', '/flows/:id/versions',
        ), true);
});

test('a nested prefix does not match a shallower path', () => {
    assert.equal(
        matchesOnSegmentBoundary(
            '/flows/f1', '/flows/:id/versions',
        ), false);
});

test('a prefix matches only on a segment boundary', () => {
    assert.equal(
        matchesOnSegmentBoundary('/memberships', '/members'),
        false);
    assert.equal(
        matchesOnSegmentBoundary('/members/m1', '/members'),
        true);
    assert.equal(
        matchesOnSegmentBoundary('/anything', '/'), true);
});

const grant = (
    id: string, identity: string, role: string,
    action: 'granted' | 'revoked', at: string,
    organization: string,
) => ({
    id, organization_id: organization, identity_id: identity,
    role, action, by_member_id: 'system', at,
});

test('a granted role with no later revoke is held', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrganization(rows, 'current', 'A'),
        ['admin']);
});

test('latest action per (identity, role) wins', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000000Z', 'A'),
        grant('2', 'current', 'admin', 'revoked',
            '2026-02-01T00:00:00.000000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrganization(rows, 'current', 'A'), []);
});

test('roles are isolated per identity', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrganization(rows, 'other', 'A'), []);
});

test('roles are isolated per org', () => {
    const rows = [
        grant('1', 'current', 'admin', 'granted',
            '2026-01-01T00:00:00.000000Z', 'A'),
    ];
    assert.deepEqual(
        currentRolesForInOrganization(rows, 'current', 'A'),
        ['admin']);
    assert.deepEqual(
        currentRolesForInOrganization(rows, 'current', 'B'), []);
});

test('a same-instant revoke beats the grant, either order',
() => {
    // FAIL CLOSED: a co-timestamped revoke wins regardless of
    // insertion order — same-instant pairs only arise across
    // realms (two tabs), where append order proves nothing.
    const at = '2026-03-01T00:00:00.000000Z';
    assert.deepEqual(
        currentRolesForInOrganization([
            grant('1', 'current', 'admin', 'granted',
                at, 'A'),
            grant('2', 'current', 'admin', 'revoked',
                at, 'A'),
        ], 'current', 'A'),
        []);
    assert.deepEqual(
        currentRolesForInOrganization([
            grant('1', 'current', 'admin', 'revoked',
                at, 'A'),
            grant('2', 'current', 'admin', 'granted',
                at, 'A'),
        ], 'current', 'A'),
        []);
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

test('member tier: content surfaces are permitted', () => {
    assert.equal(
        isPermitted('GET', '/ideas', ['member']), true);
    assert.equal(
        isPermitted('PUT', '/ideas/i1', ['member']), true);
    assert.equal(
        isPermitted(
            'POST', '/work-orders/w1/claim', ['member']),
        true);
    assert.equal(
        isPermitted(
            'POST', '/identity-tokens/j1/rotation',
            ['member']),
        true);
    assert.equal(
        isPermitted('GET', '/organizations/1', ['member']),
        true);
});

test('member tier: admin surfaces stay denied', () => {
    assert.equal(
        isPermitted('PUT', '/role-grants/r1', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/identities', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/snapshots/schema', ['member']),
        false);
    assert.equal(
        isPermitted('PUT', '/organizations/1', ['member']),
        false);
    assert.equal(
        isPermitted('PUT', '/members/m1', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/identity-tokens', ['member']),
        false);
});

test('prefixes match on segment boundaries only', () => {
    // '/members' grants the member read tier; it must never
    // half-match '/memberships' — a different, admin-only
    // surface that merely shares the leading characters.
    assert.equal(
        isPermitted('GET', '/members', ['member']), true);
    assert.equal(
        isPermitted('GET', '/members/m1', ['member']), true);
    assert.equal(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/memberships/m1', ['member']),
        false);
});
