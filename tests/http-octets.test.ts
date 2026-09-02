import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { Octets } from '../shared/http-message/octets.ts';

Deno.test('Octets round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 128, 65]);
    const octets = Octets.fromBytes(bytes);
    const restored = Octets.fromBase64(octets.toBase64());
    assert(restored.equals(octets));
    assertEquals(restored.asBytes(), bytes);
});

Deno.test('Octets.toBase64 is standard padded base64', () => {
    assertStrictEquals(Octets.fromLatin1('Man').toBase64(), 'TWFu');
    assertStrictEquals(Octets.fromLatin1('M').toBase64(), 'TQ==');
    assertStrictEquals(Octets.fromLatin1('Ma').toBase64(), 'TWE=');
});

Deno.test('Octets round-trips latin-1 text including high bytes', () => {
    const text = 'café';
    const octets = Octets.fromLatin1(text);
    assertStrictEquals(octets.toLatin1(), text);
    assertStrictEquals(octets.byteLength(), 4);
});

Deno.test('Octets.asBytes returns a copy, not the inner array', () => {
    const octets = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const copy = octets.asBytes();
    copy[0] = 99;
    assertEquals(
        octets.asBytes(),
        new Uint8Array([1, 2, 3]),
    );
});

Deno.test('Octets.fromBytes copies its input', () => {
    const source = new Uint8Array([1, 2, 3]);
    const octets = Octets.fromBytes(source);
    source[0] = 99;
    assertEquals(
        octets.asBytes(),
        new Uint8Array([1, 2, 3]),
    );
});

Deno.test('Octets.equals compares by content', () => {
    const a = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const b = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const c = Octets.fromBytes(new Uint8Array([1, 2, 4]));
    assert(a.equals(b));
    assert(!a.equals(c));
});

Deno.test('Octets.equals is false for different lengths', () => {
    const a = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const b = Octets.fromBytes(new Uint8Array([1, 2]));
    assert(!a.equals(b));
});
