import { assertEquals } from '@std/assert';
import {
    imfFixdate,
    leafHashHex,
    pairRootHex,
    secretHashHex,
} from '../shared/pair-root.ts';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

Deno.test('pinned row matches the four digests', async () => {
    const request = new TextEncoder().encode('req');
    const requestSalt = new Uint8Array(16).fill(0x11);
    const secret = new Uint8Array(0);
    const responseSalt = new Uint8Array(16).fill(0x22);
    const response = new TextEncoder().encode(
        'HTTP/1.1 201 \r\n'
        + 'content-length: 5\r\n'
        + 'date: Wed, 23 Sep 2026 00:00:00 GMT\r\n'
        + 'etag: "AAAAAAAAAAAAAAAAAAAAAA"\r\n'
        + '\r\n'
        + 'hello',
    );
    const requestHash = await leafHashHex(
        requestSalt, request,
    );
    const secretHash = await secretHashHex(secret);
    const responseHash = await leafHashHex(
        responseSalt, response,
    );
    const pairHash = await pairRootHex({
        id: '00000000-0000-0000-0000-000000000001',
        operationId: '00000000-0000-0000-0000-000000000002',
        path: '/migrations/',
        name: '0001-example',
        supersedes: NIL_UUID,
        requesterIdentityId: 'fa_owner',
        method: 'PUT',
        responseAt: '2026-09-23T00:00:00.000000Z',
        requestHashHex: requestHash,
        secretHashHex: secretHash,
        responseHashHex: responseHash,
    });
    assertEquals(
        requestHash,
        'bf60c6295dfe880bfc15db7af6ee2acc1991cf793a765123e035e9c54326ab39',
    );
    assertEquals(
        secretHash,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assertEquals(
        responseHash,
        '2f3231e1a728bf8d8997752e308dd9e2adbb14dc83fb76d9ee23d7208d6c5f87',
    );
    assertEquals(
        pairHash,
        'f2e4a0d0c4a55a8e5efbbf3a689ab8ef03278458c3bc8510e0b5f9ae532364b9',
    );
    assertEquals(
        imfFixdate('2026-09-23T00:00:00.000000Z'),
        'Wed, 23 Sep 2026 00:00:00 GMT',
    );
    assertEquals(
        imfFixdate('2026-09-23T00:00:00.000000Z').length,
        29,
    );
});
