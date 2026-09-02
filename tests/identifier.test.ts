import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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

Deno.test('generateIdentifier returns 22 canonical chars',
() => {
    const id = generateIdentifier();
    assertStrictEquals(id.length, IDENTIFIER_ASCII_LENGTH);
    assertStrictEquals(isIdentifier(id), true);
    assert(FINALS.has(id[21]!));
});

Deno.test('isIdentifier rejects 21, 23, bad final, + / =',
() => {
    const good = generateIdentifier();
    assertStrictEquals(isIdentifier(good.slice(0, 21)), false);
    assertStrictEquals(isIdentifier(good + 'A'), false);
    const badFinal = good.slice(0, 21) + 'B';
    assertStrictEquals(isIdentifier(badFinal), false);
    assertStrictEquals(isIdentifier('+' + good.slice(1)), false);
    assertStrictEquals(
        isIdentifier(good.slice(0, 21) + '/'), false);
    assertStrictEquals(isIdentifier(good + '=='), false);
});

Deno.test('decode(encode(b)) and encode(decode(s)) round-trip',
() => {
    for (let i = 0; i < 200; i++) {
        const bytes = new Uint8Array(IDENTIFIER_BYTE_LENGTH);
        crypto.getRandomValues(bytes);
        const text = encodeIdentifier(bytes);
        assertStrictEquals(isIdentifier(text), true);
        assertEquals(
            [...decodeIdentifier(text)], [...bytes]);
        assertStrictEquals(
            encodeIdentifier(decodeIdentifier(text)),
            text);
    }
});

Deno.test('NIL_IDENTIFIER is 16 zero bytes and canonical',
() => {
    assertStrictEquals(isIdentifier(NIL_IDENTIFIER), true);
    assertEquals(
        [...decodeIdentifier(NIL_IDENTIFIER)],
        [...new Uint8Array(16)]);
    assertStrictEquals(
        encodeIdentifier(new Uint8Array(16)),
        NIL_IDENTIFIER);
});

Deno.test('encodeIdentifier rejects the wrong length', () => {
    assertThrows(
        () => encodeIdentifier(new Uint8Array(15)));
    assertThrows(
        () => encodeIdentifier(new Uint8Array(17)));
});

Deno.test('decodeIdentifier rejects non-canonical text', () => {
    assertThrows(() => decodeIdentifier('short'));
    const good = generateIdentifier();
    assertThrows(
        () => decodeIdentifier(good.slice(0, 21) + 'B'));
});

Deno.test('compareIdentifiers agrees with byte memcmp', () => {
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
        assertStrictEquals(
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
            assertStrictEquals(
                sign(compareIdentifiers(a, b)),
                sign(i - j),
                a + ' vs ' + b);
        }
    }
});

Deno.test('10,000 mints are distinct', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
        seen.add(generateIdentifier());
    }
    assertStrictEquals(seen.size, 10000);
});

Deno.test('6-bit symbols are uniform', () => {
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
        assert(
            Math.abs(count - expected) < tolerance,
            `Char "${ch}" appeared ${count}, expected ~`
            + expected.toFixed(0));
    }
});
