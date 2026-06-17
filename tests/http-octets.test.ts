import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Octets } from '../api/http-message/octets.ts';

test('Octets round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 128, 65]);
    const octets = Octets.fromBytes(bytes);
    const restored = Octets.fromBase64(octets.toBase64());
    assert.ok(restored.equals(octets));
    assert.deepEqual(restored.asBytes(), bytes);
});

test('Octets.toBase64 is standard padded base64', () => {
    assert.equal(Octets.fromLatin1('Man').toBase64(), 'TWFu');
    assert.equal(Octets.fromLatin1('M').toBase64(), 'TQ==');
    assert.equal(Octets.fromLatin1('Ma').toBase64(), 'TWE=');
});

test('Octets round-trips latin-1 text including high bytes', () => {
    const text = 'café';
    const octets = Octets.fromLatin1(text);
    assert.equal(octets.toLatin1(), text);
    assert.equal(octets.byteLength(), 4);
});

test('Octets.asBytes returns a copy, not the inner array', () => {
    const octets = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const copy = octets.asBytes();
    copy[0] = 99;
    assert.deepEqual(
        octets.asBytes(),
        new Uint8Array([1, 2, 3]),
    );
});

test('Octets.fromBytes copies its input', () => {
    const source = new Uint8Array([1, 2, 3]);
    const octets = Octets.fromBytes(source);
    source[0] = 99;
    assert.deepEqual(
        octets.asBytes(),
        new Uint8Array([1, 2, 3]),
    );
});

test('Octets.equals compares by content', () => {
    const a = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const b = Octets.fromBytes(new Uint8Array([1, 2, 3]));
    const c = Octets.fromBytes(new Uint8Array([1, 2, 4]));
    assert.ok(a.equals(b));
    assert.ok(!a.equals(c));
});
