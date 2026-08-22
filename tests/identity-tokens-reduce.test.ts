import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    latestActionForJti,
    chainIdForJti,
    jtisInChain,
    isTokenRevoked,
    identityForJti,
    parentJtiByJti,
    planRotation,
} from '../api/identity-tokens.ts';

const ev = (
    jti: string, action: string,
    chain: string, at: string,
) => ({
    id: jti + '@' + at, jti, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    action, chain_id: chain, at,
});

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';
const T3 = '2026-03-01T00:00:00.000000Z';

test('latestActionForJti returns the latest per jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assert.equal(latestActionForJti(rows, 'a'), 'rotated');
    assert.equal(latestActionForJti(rows, 'unknown'), null);
});

test('a same-instant revoke beats an issue, either order',
() => {
    const issued = ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1);
    const revoked = ev('a', 'revoked', 'WeXjAaAxGSpLpamfEuvcww', T1);
    assert.equal(
        latestActionForJti([issued, revoked], 'a'),
        'revoked');
    assert.equal(
        latestActionForJti([revoked, issued], 'a'),
        'revoked');
});

test('a same-instant revoke beats a rotate, either order',
() => {
    const rotated = ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T1);
    const revoked = ev('a', 'revoked', 'WeXjAaAxGSpLpamfEuvcww', T1);
    assert.equal(
        latestActionForJti([rotated, revoked], 'a'),
        'revoked');
    assert.equal(
        latestActionForJti([revoked, rotated], 'a'),
        'revoked');
});

test('chainIdForJti and jtisInChain group a lineage', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        ev('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    assert.equal(chainIdForJti(rows, 'b'), 'WeXjAaAxGSpLpamfEuvcww');
    assert.equal(chainIdForJti(rows, 'z'), null);
    assert.deepEqual(jtisInChain(rows, 'WeXjAaAxGSpLpamfEuvcww').sort()
        , ['a', 'b']);
});

test('isTokenRevoked denies only a revoked jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('b', 'revoked', 'c2', T1),
    ];
    assert.equal(isTokenRevoked(rows, 'a'), false);   // live
    assert.equal(isTokenRevoked(rows, 'b'), true);    // revoked
    assert.equal(isTokenRevoked(rows, 'unknown'), false);
});

test('identityForJti finds the owner', () => {
    const rows = [ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)];
    assert.equal(identityForJti(rows, 'a'), 'XXZruirZyAOoRpNxaDnpSA');
    assert.equal(identityForJti(rows, 'z'), null);
});

test('parentJtiByJti derives a successor parent, none for root',
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
    assert.equal(parent.get('b'), 'a');
    assert.equal(parent.get('c'), 'b');
    assert.equal(parent.has('a'), false);   // root: no entry
});

test('parentJtiByJti scopes the pairing within a chain', () => {
    // A shared `at` across chains must NOT cross-pair: a's
    // issue (WeXjAaAxGSpLpamfEuvcww) does not adopt c2's co-instant rotated
    // jti.
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('z', 'rotated', 'c2', T1),
    ];
    assert.equal(parentJtiByJti(rows).has('a'), false);
});

test('planRotation rotates a live jti', () => {
    const plan = planRotation(
        [ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1)], 'a', 'b', T2);
    assert.equal(plan.kind, 'rotate');
    assert.equal(plan.kind === 'rotate' && plan.newJti, 'b');
    assert.equal(
        plan.kind === 'rotate' && plan.appends.length, 2);
});

test('planRotation flags replay of a rotated-away jti', () => {
    const rows = [
        ev('a', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T1),
        ev('a', 'rotated', 'WeXjAaAxGSpLpamfEuvcww', T2),
        ev('b', 'issued', 'WeXjAaAxGSpLpamfEuvcww', T2),
    ];
    const plan = planRotation(rows, 'a', 'x', T2);
    assert.equal(plan.kind, 'replay');
    // revokes every jti in the chain (a and b)
    assert.equal(
        plan.kind === 'replay' && plan.appends.length, 2);
});

test('planRotation reports an unknown jti', () => {
    assert.equal(
        planRotation([], 'ghost', 'x', T1).kind, 'unknown');
});
