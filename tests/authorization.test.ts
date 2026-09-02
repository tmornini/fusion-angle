import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    composeClaimRole,
    projectClaimRolesForOrganization,
    isPermitted,
    matchesOnSegmentBoundary,
} from '../api/authorization.ts';

Deno.test('a :id segment in a prefix matches any path segment',
() => {
    assertStrictEquals(
        matchesOnSegmentBoundary(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'ZOousbbnzpqlxJExVAruYQ/versions/xDyDkxEPwtcNmJVknUHDsg',
                '/organizations/:id/flows/:id/versions',
        ), true);
});

Deno.test('a nested prefix does not match a shallower path', () => {
    assertStrictEquals(
        matchesOnSegmentBoundary(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'ZOousbbnzpqlxJExVAruYQ',
                '/organizations/:id/flows/:id/versions',
        ), false);
});

Deno.test('a prefix matches only on a segment boundary', () => {
    assertStrictEquals(
        matchesOnSegmentBoundary('/memberships', '/members'),
        false);
    assertStrictEquals(
        matchesOnSegmentBoundary('/members/mFNSxZqywTSMXhgUTdTqtA'
            , '/members'),
        true);
    assertStrictEquals(
        matchesOnSegmentBoundary('/anything', '/'), true);
});

Deno.test('composeClaimRole joins type and organization', () => {
    assertStrictEquals(composeClaimRole('admin', 'AjdvjuECVZEgZoFajaIEkg')
        , 'admin:AjdvjuECVZEgZoFajaIEkg');
    assertStrictEquals(composeClaimRole('member', 'A'), 'member:A');
});

Deno.test('projectClaimRolesForOrganization keeps only the'
+ ' fenced org bases', () => {
    assertEquals(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'A',
        ),
        ['admin']);
    assertEquals(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'B',
        ),
        ['member']);
    assertEquals(
        projectClaimRolesForOrganization(
            ['admin:A', 'member:B'], 'C',
        ),
        []);
});

Deno.test('projectClaimRolesForOrganization ignores unknown'
+ ' bases', () => {
    assertEquals(
        projectClaimRolesForOrganization(
            ['viewer:A', 'admin:A'], 'A',
        ),
        ['admin']);
});

Deno.test('admin is permitted on every verb at root', () => {
    for (const verb of ['GET', 'PUT', 'POST', 'DELETE']) {
        assertStrictEquals(
            isPermitted(verb, '/memberships/x', ['admin']),
            true);
        assertStrictEquals(
            isPermitted(
                verb, '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                    , ['admin'],
            ), true);
    }
});

Deno.test('deny-by-default: no held role is forbidden', () => {
    assertStrictEquals(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members', [],
        ), false);
    assertStrictEquals(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                , ['viewer'],
        ), false);
});

Deno.test('member tier: content surfaces are permitted', () => {
    assertStrictEquals(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas', ['member'],
        ), true);
    assertStrictEquals(
        isPermitted('PUT'
            , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'fndCYAsXazdzMUlEGMNIZw', ['member']), true);
    assertStrictEquals(
        isPermitted(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'xdaJyuuPyHfffCGLhqDrOQ/claim', ['member']),
        true);
    assertStrictEquals(
        isPermitted(
            'DELETE', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'xdaJyuuPyHfffCGLhqDrOQ/claim', ['member']),
        true);
    assertStrictEquals(
        isPermitted(
            'POST', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
                + 'jmvogLnzTmiQlAkVvDHrvQ/rotation',
            ['member']),
        true);
    assertStrictEquals(
        isPermitted('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg'
            , ['member']),
        true);
});

Deno.test('member tier: admin surfaces stay denied', () => {
    assertStrictEquals(
        isPermitted('PUT', '/memberships/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assertStrictEquals(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assertStrictEquals(
        isPermitted('GET', '/identities', ['member']),
        false);
    assertStrictEquals(
        isPermitted('PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg'
            , ['member']),
        false);
    assertStrictEquals(
        isPermitted('PUT', '/members/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assertStrictEquals(
        isPermitted(
            'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens', ['member'],
        ),
        false);
});

Deno.test('prefixes match on segment boundaries only', () => {
    // '/members' grants the member read tier; it must never
    // half-match '/memberships' — a different, admin-only
    // surface that merely shares the leading characters.
    assertStrictEquals(
        isPermitted(
            'GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/members'
                , ['member'],
        ), true);
    assertStrictEquals(
        isPermitted('GET', '/members/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
    assertStrictEquals(
        isPermitted('GET', '/memberships', ['member']),
        false);
    assertStrictEquals(
        isPermitted('GET', '/memberships/mFNSxZqywTSMXhgUTdTqtA', ['member']),
        false);
});
