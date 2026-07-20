import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    composeClaimRole,
    projectClaimRolesForOrganization,
    isPermitted,
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

test('composeClaimRole joins type and organization', () => {
    assert.equal(composeClaimRole('admin', '1'), 'admin:1');
    assert.equal(composeClaimRole('member', 'A'), 'member:A');
});

test('projectClaimRolesForOrganization keeps only the'
+ ' fenced org bases', () => {
    assert.deepEqual(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'A',
        ),
        ['admin']);
    assert.deepEqual(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'B',
        ),
        ['member']);
    assert.deepEqual(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'C',
        ),
        []);
});

test('projectClaimRolesForOrganization ignores unknown'
+ ' bases', () => {
    assert.deepEqual(
        projectClaimRolesForOrganization(
            ['viewer:A', 'admin:A'], 'A',
        ),
        ['admin']);
});

test('admin is permitted on every verb at root', () => {
    for (const verb of ['GET', 'PUT', 'POST', 'DELETE']) {
        assert.equal(
            isPermitted(verb, '/memberships/x', ['admin']),
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
        isPermitted('PUT', '/memberships/m1', ['member']),
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
