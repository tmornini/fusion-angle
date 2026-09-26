import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    latestActionForJti,
    chainIdForJti,
    jtisInChain,
    isTokenRevoked,
    identityForJti,
    planRotation,
} from '../shared/identity-tokens.ts';
import type { IdentityTokenAction } from '../shared/types.ts';

const IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';

// One head per jti: the document's name is its jti.
const head = (
    jti: string, action: IdentityTokenAction,
    chain: string, at: string,
) => ({
    id: jti, jti, identity_id: IDENTITY,
    action, chain_id: chain, at,
});

const T0 = '2025-12-01T00:00:00.000000Z';
const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

Deno.test('latestActionForJti returns the head\'s action', () => {
    const heads = [
        head('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assertStrictEquals(latestActionForJti(heads, 'a'), 'rotated');
    assertStrictEquals(latestActionForJti(heads, 'unknown'), null);
});

Deno.test('chainIdForJti and jtisInChain group a lineage', () => {
    const heads = [
        head('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        head('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assertStrictEquals(chainIdForJti(heads, 'b'), 'WeXjAaAxGSpLpamfEuvcww');
    assertStrictEquals(chainIdForJti(heads, 'z'), null);
    assertEquals(jtisInChain(heads, 'WeXjAaAxGSpLpamfEuvcww').sort()
        , ['a', 'b']);
});

Deno.test('isTokenRevoked denies only a revoked jti', () => {
    const heads = [
        head('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        head('b', 'revoked', 'c2', T1),
    ];
    assertStrictEquals(isTokenRevoked(heads, 'a'), false);   // live
    assertStrictEquals(isTokenRevoked(heads, 'b'), true);    // revoked
    assertStrictEquals(isTokenRevoked(heads, 'unknown'), false);
});

Deno.test('identityForJti finds the owner', () => {
    const heads = [head('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)];
    assertStrictEquals(identityForJti(heads, 'a'), IDENTITY);
    assertStrictEquals(identityForJti(heads, 'z'), null);
});

Deno.test('planRotation rotates a live jti', () => {
    const plan = planRotation(
        [head('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)], 'a', 'b', T2);
    assertStrictEquals(plan.kind, 'rotate');
    assertStrictEquals(plan.kind === 'rotate' && plan.newJti, 'b');
    assertStrictEquals(
        plan.kind === 'rotate' && plan.appends.length, 2);
});

Deno.test('planRotation flags replay of a rotated-away jti', () => {
    const heads = [
        head('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        head('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    const plan = planRotation(heads, 'a', 'x', T2);
    assertStrictEquals(plan.kind, 'replay');
    // revokes every jti in the chain (a and b)
    assertStrictEquals(
        plan.kind === 'replay' && plan.appends.length, 2);
});

Deno.test('planRotation reports an unknown jti', () => {
    assertStrictEquals(
        planRotation([], 'ghost', 'x', T1).kind, 'unknown');
});

Deno.test('a rotation plan carries the parent forward', () => {
    const heads = [{
        id: 'p', jti: 'p', identity_id: IDENTITY,
        action: 'issued' as const, chain_id: 'c', at: T0,
        parent_jti: 'root',
    }];
    const plan = planRotation(heads, 'p', 'n', T1);
    assertStrictEquals(plan.kind, 'rotate');
    if (plan.kind !== 'rotate') return;
    assertEquals(plan.appends, [
        {
            jti: 'p', identity_id: IDENTITY,
            action: 'rotated', chain_id: 'c', at: T1,
            parent_jti: 'root',
        },
        {
            jti: 'n', identity_id: IDENTITY,
            action: 'issued', chain_id: 'c', at: T1,
            parent_jti: 'p',
        },
    ]);
});
