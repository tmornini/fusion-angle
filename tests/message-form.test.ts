import {
    assert,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    buildRequestModel,
    canonicalJson,
    storedWire,
    requestMessageHash,
} from '../api/message-form.ts';
import { formWriteMessagePair } from '../api/message-pair.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import {
    sha256Hex,
    sha256HexOfBytes,
} from '../shared/digest.ts';
import { Octets } from '../shared/http-message/octets.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

const AT = '2026-06-15T09:30:00.123456Z';

const validInput = {
    method: 'PUT',
    pathname: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
    routePattern: 'organizations/:id/ideas/:id',
    routeSegments: ['ideas', ':id'],
    pathSegments: ['ideas', '42'],
    headerFields: [],
    body: { title: 'T' },
    requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
    requestAt: AT,
    organization: 'AjdvjuECVZEgZoFajaIEkg',
    responseStatus: 204,
    responseBody: undefined,
    operationId: TEST_OPERATION_ID,
};

Deno.test('canonical JSON is stable across key permutations',
() => {
    const a = buildRequestModel({
        method: 'PUT',
        target: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
        fields: [
            { name: 'idempotency-key', value: 'k1' },
            { name: 'authorization', value: 'Bearer x' },
        ],
        body: { zebra: 1, alpha: { b: 2, a: 1 } },
    });
    const b = buildRequestModel({
        method: 'PUT',
        target: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42',
        fields: [
            { name: 'authorization', value: 'Bearer x' },
            { name: 'idempotency-key', value: 'k1' },
        ],
        body: { alpha: { a: 1, b: 2 }, zebra: 1 },
    });
    assertStrictEquals(canonicalJson(a), canonicalJson(b));
});

Deno.test('the at string round-trips byte-exact', () => {
    const model = buildRequestModel({
        method: 'PUT', target: '/x', fields: [],
        body: { at: AT },
    });
    assert(canonicalJson(model).includes(AT));
});

Deno.test('message hash covers the fields', async () => {
    const base = {
        method: 'PUT', target: '/x',
        body: { v: 1 },
    };
    const withKey = buildRequestModel({
        ...base,
        fields: [{ name: 'idempotency-key', value: 'k' }],
    });
    const without = buildRequestModel(
        { ...base, fields: [] },
    );
    assertNotStrictEquals(
        await requestMessageHash(storedWire(withKey)),
        await requestMessageHash(storedWire(without)),
    );
});

Deno.test('stored pair message is serializeWire',
async () => {
    const messagePair = await formWriteMessagePair(validInput);
    assertStrictEquals(
        messagePair.requestMessage.includes('\r\n\r\n'),
        true,
    );
    assertStrictEquals(
        messagePair.requestMessage.includes('"startLine"'),
        false,
    );
    const model = parseWire(messagePair.requestMessage);
    assertStrictEquals(model.startLine.kind, 'request');
});

Deno.test('stored wire round-trips euro and emoji',
async () => {
    const model = buildRequestModel({
        method: 'PUT',
        target: '/x',
        fields: [],
        body: { note: '€😀' },
    });
    const wire = storedWire(model);
    const back = parseWire(wire);
    const body = HttpMessage.fromModel(back).body();
    assertStrictEquals(
        JSON.parse(body.toText()).note, '€😀',
    );
});

Deno.test('request hash is sha256 of Latin-1 octets',
async () => {
    const model = buildRequestModel({
        method: 'PUT',
        target: '/x',
        fields: [],
        body: { note: '€' },
    });
    const wire = storedWire(model);
    const got = await requestMessageHash(wire);
    const want = await sha256HexOfBytes(
        Octets.fromLatin1(wire).asBytes(),
    );
    assertStrictEquals(got, want);
    assertNotStrictEquals(got, await sha256Hex(wire));
});
