import {
    assertMatch,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    sha256Bytes,
    sha256Hex,
    sha256HexOfBytes,
} from '../shared/digest.ts';
import { Octets } from
    '../shared/http-message/octets.ts';

Deno.test('sha256Bytes returns 32 bytes', async () => {
    const bytes = await sha256Bytes('abc');
    assertStrictEquals(bytes.length, 32);
});

Deno.test('sha256Hex matches the known vector', async () => {
    // NIST test vector for "abc"
    assertStrictEquals(
        await sha256Hex('abc'),
        'ba7816bf8f01cfea414140de5dae2223'
        + 'b00361a396177a9cb410ff61f20015ad',
    );
});

Deno.test('sha256Hex is lower-case hex, 64 chars', async () => {
    const hex = await sha256Hex('');
    assertMatch(hex, /^[0-9a-f]{64}$/);
});

Deno.test('sha256HexOfBytes matches the empty vector',
async () => {
    assertStrictEquals(
        await sha256HexOfBytes(new Uint8Array(0)),
        await sha256Hex(''),
    );
});

Deno.test('sha256HexOfBytes hashes raw octets, not UTF-8',
async () => {
    // JS '€' is U+20AC. fromLatin1 keeps one octet 0xAC.
    // TextEncoder('€') is UTF-8 E2 82 AC. Those hashes
    // must differ — this is why message_hash cannot use
    // sha256Hex on a Latin-1 wire string.
    const euro = '€';
    const latin1 = Octets.fromLatin1(euro);
    const fromBytes = await sha256HexOfBytes(
        latin1.asBytes(),
    );
    const fromText = await sha256Hex(euro);
    assertStrictEquals(latin1.asBytes().length, 1);
    assertNotStrictEquals(fromBytes, fromText);
    assertMatch(fromBytes, /^[0-9a-f]{64}$/);
});

Deno.test('sha256HexOfBytes covers 0x00 0x80 0xFF',
async () => {
    const hex = await sha256HexOfBytes(
        Uint8Array.of(0x00, 0x80, 0xff),
    );
    assertMatch(hex, /^[0-9a-f]{64}$/);
    assertNotStrictEquals(hex, await sha256Hex(''));
});
