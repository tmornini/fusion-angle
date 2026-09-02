import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    latestActionForJti,
    chainIdForJti,
    jtisInChain,
    isTokenRevoked,
    identityForJti,
    parentJtiByJti,
    planRotation,
} from '../api/identity-tokens.ts';
import type { IdentityTokenAction } from '../api/types.ts';

const ev = (
    jti: string, action: IdentityTokenAction,
    chain: string, at: string,
) => ({
    id: jti + '@' + at, jti, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    action, chain_id: chain, at,
});

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';
const T3 = '2026-03-01T00:00:00.000000Z';

Deno.test('latestActionForJti returns the latest per jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assertStrictEquals(latestActionForJti(rows, 'a'), 'rotated');
    assertStrictEquals(latestActionForJti(rows, 'unknown'), null);
});

Deno.test('a same-instant revoke beats an issue, either order',
() => {
    const issued = ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1);
    const revoked = ev('a', 'revoked', 'WeXjAaAxGSpLpamfEuvcww', T1);
    assertStrictEquals(
        latestActionForJti([issued, revoked], 'a'),
        'revoked');
    assertStrictEquals(
        latestActionForJti([revoked, issued], 'a'),
        'revoked');
});

Deno.test('a same-instant revoke beats a rotate, either order',
() => {
    const rotated = ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T1);
    const revoked = ev('a', 'revoked', 'WeXjAaAxGSpLpamfEuvcww', T1);
    assertStrictEquals(
        latestActionForJti([rotated, revoked], 'a'),
        'revoked');
    assertStrictEquals(
        latestActionForJti([revoked, rotated], 'a'),
        'revoked');
});

Deno.test('chainIdForJti and jtisInChain group a lineage', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        ev('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assertStrictEquals(chainIdForJti(rows, 'b'), 'WeXjAaAxGSpLpamfEuvcww');
    assertStrictEquals(chainIdForJti(rows, 'z'), null);
    assertEquals(jtisInChain(rows, 'WeXjAaAxGSpLpamfEuvcww').sort()
        , ['a', 'b']);
});

Deno.test('isTokenRevoked denies only a revoked jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('b', 'revoked', 'c2', T1),
    ];
    assertStrictEquals(isTokenRevoked(rows, 'a'), false);   // live
    assertStrictEquals(isTokenRevoked(rows, 'b'), true);    // revoked
    assertStrictEquals(isTokenRevoked(rows, 'unknown'), false);
});

Deno.test('identityForJti finds the owner', () => {
    const rows = [ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)];
    assertStrictEquals(identityForJti(rows, 'a'), 'XXZruirZyAOoRpNxaDnpSA');
    assertStrictEquals(identityForJti(rows, 'z'), null);
});

Deno.test('parentJtiByJti derives a successor parent, none for root',
() => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)
            ,    // root: no predecessor
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        ev('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2)
            ,    // b ← a (co-`at` T2)
        ev('b', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T3),
        ev('c', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T3)
            ,    // c ← b (co-`at` T3)
    ];
    const parent = parentJtiByJti(rows);
    assertStrictEquals(parent.get('b'), 'a');
    assertStrictEquals(parent.get('c'), 'b');
    assertStrictEquals(parent.has('a'), false);   // root: no entry
});

Deno.test('parentJtiByJti scopes the pairing within a chain', () => {
    // A shared `at` across chains must NOT cross-pair: a's
    // issue (WeXjAaAxGSpLpamfEuvcww) does not adopt c2's co-instant rotated
    // jti.
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('z', 'rotated', 'c2', T1),
    ];
    assertStrictEquals(parentJtiByJti(rows).has('a'), false);
});

Deno.test('planRotation rotates a live jti', () => {
    const plan = planRotation(
        [ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)], 'a', 'b', T2);
    assertStrictEquals(plan.kind, 'rotate');
    assertStrictEquals(plan.kind === 'rotate' && plan.newJti, 'b');
    assertStrictEquals(
        plan.kind === 'rotate' && plan.appends.length, 2);
});

Deno.test('planRotation flags replay of a rotated-away jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        ev('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    const plan = planRotation(rows, 'a', 'x', T2);
    assertStrictEquals(plan.kind, 'replay');
    // revokes every jti in the chain (a and b)
    assertStrictEquals(
        plan.kind === 'replay' && plan.appends.length, 2);
});

Deno.test('planRotation reports an unknown jti', () => {
    assertStrictEquals(
        planRotation([], 'ghost', 'x', T1).kind, 'unknown');
});
