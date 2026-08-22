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
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'ZOousbbnzpqlxJExVAruYQ/versions/xDyDkxEPwtcNmJVknUHDsg',
                '/organizations/:id/flows/:id/versions',
        ), true);
});

test('a nested prefix does not match a shallower path', () => {
    assert.equal(
        matchesOnSegmentBoundary(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'ZOousbbnzpqlxJExVAruYQ',
                '/organizations/:id/flows/:id/versions',
        ), false);
});

test('a prefix matches only on a segment boundary', () => {
    assert.equal(
        matchesOnSegmentBoundary('/memberships', '/members'),
        false);
    assert.equal(
        matchesOnSegmentBoundary('/members/mFNSxZqywTSMXhgUTdTqtA'
            , '/members'),
        true);
    assert.equal(
        matchesOnSegmentBoundary('/anything', '/'), true);
});

test('composeClaimRole joins type and organization', () => {
    assert.equal(composeClaimRole('admin', 'AjdvjuECVZEgZoFajaIEkg')
        , 'admin:AjdvjuECVZEgZoFajaIEkg');
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
            isPermitted(
                verb, '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                    , ['admin'],
            ), true);
    }
});

test('deny-by-default: no held role is forbidden', () => {
    assert.equal(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members', [],
        ), false);
    assert.equal(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                , ['viewer'],
        ), false);
});

test('member tier: content surfaces are permitted', () => {
    assert.equal(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas', ['member'],
        ), true);
    assert.equal(
        isPermitted('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'fndCYAsXazdzMUlEGMNIZw', ['member']), true);
    assert.equal(
        isPermitted(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'xdaJyuuPyHfffCGLhqDrOQ/claim', ['member']),
        true);
    assert.equal(
        isPermitted(
            'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'xdaJyuuPyHfffCGLhqDrOQ/claim', ['member']),
        true);
    assert.equal(
        isPermitted(
            'POST', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'jmvogLnzTmiQlAkVvDHrvQ/rotation',
            ['member']),
        true);
    assert.equal(
        isPermitted('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg'
            , ['member']),
        true);
});

test('member tier: admin surfaces stay denied', () => {
    assert.equal(
        isPermitted('PUT', '/memberships/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/identities', ['member']),
        false);
    assert.equal(
        isPermitted('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg'
            , ['member']),
        false);
    assert.equal(
        isPermitted('PUT', '/members/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assert.equal(
        isPermitted(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens', ['member'],
        ),
        false);
});

test('prefixes match on segment boundaries only', () => {
    // '/members' grants the member read tier; it must never
    // half-match '/memberships' — a different, admin-only
    // surface that merely shares the leading characters.
    assert.equal(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                , ['member'],
        ), true);
    assert.equal(
        isPermitted('GET', '/members/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assert.equal(
        isPermitted('GET', '/memberships/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
});
