import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    IDENTIFIER_ASCII_LENGTH,
    IDENTIFIER_BYTE_LENGTH,
    NIL_IDENTIFIER,
    generateIdentifier,
    encodeIdentifier,
    decodeIdentifier,
    isIdentifier,
    compareIdentifiers,
} from '../shared/identifier.ts';

const FINALS = new Set(['A', 'Q', 'g', 'w']);
const ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

test('generateIdentifier returns 22 canonical chars',
() => {
    const id = generateIdentifier();
    assert.equal(id.length, IDENTIFIER_ASCII_LENGTH);
    assert.equal(isIdentifier(id), true);
    assert.ok(FINALS.has(id[21]!));
});

test('isIdentifier rejects 21, 23, bad final, + / =',
() => {
    const good = generateIdentifier();
    assert.equal(isIdentifier(good.slice(0, 21)), false);
    assert.equal(isIdentifier(good + 'A'), false);
    const badFinal = good.slice(0, 21) + 'B';
    assert.equal(isIdentifier(badFinal), false);
    assert.equal(isIdentifier('+' + good.slice(1)), false);
    assert.equal(
        isIdentifier(good.slice(0, 21) + '/'), false);
    assert.equal(isIdentifier(good + '=='), false);
});

test('decode(encode(b)) and encode(decode(s)) round-trip',
() => {
    for (let i = 0; i < 200; i++) {
        const bytes = new Uint8Array(IDENTIFIER_BYTE_LENGTH);
        crypto.getRandomValues(bytes);
        const text = encodeIdentifier(bytes);
        assert.equal(isIdentifier(text), true);
        assert.deepEqual(
            [...decodeIdentifier(text)], [...bytes]);
        assert.equal(
            encodeIdentifier(decodeIdentifier(text)),
            text);
    }
});

test('NIL_IDENTIFIER is 16 zero bytes and canonical',
() => {
    assert.equal(isIdentifier(NIL_IDENTIFIER), true);
    assert.deepEqual(
        [...decodeIdentifier(NIL_IDENTIFIER)],
        [...new Uint8Array(16)]);
    assert.equal(
        encodeIdentifier(new Uint8Array(16)),
        NIL_IDENTIFIER);
});

test('encodeIdentifier rejects the wrong length', () => {
    assert.throws(
        () => encodeIdentifier(new Uint8Array(15)));
    assert.throws(
        () => encodeIdentifier(new Uint8Array(17)));
});

test('decodeIdentifier rejects non-canonical text', () => {
    assert.throws(() => decodeIdentifier('short'));
    const good = generateIdentifier();
    assert.throws(
        () => decodeIdentifier(good.slice(0, 21) + 'B'));
});

test('compareIdentifiers agrees with byte memcmp', () => {
    function memcmp(
        a: Uint8Array, b: Uint8Array,
    ): number {
        for (let i = 0; i < 16; i++) {
            if (a[i]! !== b[i]!) return a[i]! - b[i]!;
        }
        return 0;
    }
    const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0);
    for (let i = 0; i < 10000; i++) {
        const ab = new Uint8Array(16);
        const bb = new Uint8Array(16);
        crypto.getRandomValues(ab);
        crypto.getRandomValues(bb);
        const a = encodeIdentifier(ab);
        const b = encodeIdentifier(bb);
        assert.equal(
            sign(compareIdentifiers(a, b)),
            sign(memcmp(ab, bb)));
    }
    const cases = ['A', 'a', '0', '-', '_'].map((ch) => {
        const bytes = new Uint8Array(16);
        // High 6 bits of byte 0 = that digit's value.
        // Digits: A=0, a=26, 0=52, -=62, _=63.
        const digit: Record<string, number> = {
            A: 0, a: 26, 0: 52, '-': 62, _: 63,
        };
        bytes[0] = digit[ch]! << 2;
        return encodeIdentifier(bytes);
    });
    for (let i = 0; i < cases.length; i++) {
        for (let j = 0; j < cases.length; j++) {
            const a = cases[i]!;
            const b = cases[j]!;
            assert.equal(
                sign(compareIdentifiers(a, b)),
                sign(i - j),
                a + ' vs ' + b);
        }
    }
});

test('10,000 mints are distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
        seen.add(generateIdentifier());
    }
    assert.equal(seen.size, 10000);
});

test('6-bit symbols are uniform', () => {
    const counts = new Map<string, number>();
    for (const ch of ALPHABET) counts.set(ch, 0);
    const n = 20000;
    for (let i = 0; i < n; i++) {
        const id = generateIdentifier();
        for (let k = 0; k < 21; k++) {
            counts.set(id[k]!, counts.get(id[k]!)! + 1);
        }
    }
    const expected = n * 21 / 64;
    const tolerance = expected * 0.08;
    for (const ch of ALPHABET) {
        const count = counts.get(ch)!;
        assert.ok(
            Math.abs(count - expected) < tolerance,
            `Char "${ch}" appeared ${count}, expected ~`
            + expected.toFixed(0));
    }
});
