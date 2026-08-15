import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRequestModel,
    buildResponseModel,
    canonicalJson,
    storedWire,
    requestMessageHash,
    documentVersion,
    HEX64,
} from '../api/message-form.ts';
import { formWritePair } from '../api/message-pair.ts';
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
    pathname: '/ideas/42',
    routePattern: 'ideas/:id',
    routeSegments: ['ideas', ':id'],
    pathSegments: ['ideas', '42'],
    headerFields: [],
    body: { title: 'T' },
    requesterIdentityId: 'current',
    requestAt: AT,
    organization: '1',
    responseStatus: 204,
    responseBody: undefined,
    operationId: TEST_OPERATION_ID,
};

test('canonical JSON is stable across key permutations',
() => {
    const a = buildRequestModel({
        method: 'PUT',
        target: '/ideas/42',
        fields: [
            { name: 'idempotency-key', value: 'k1' },
            { name: 'authorization', value: 'Bearer x' },
        ],
        body: { zebra: 1, alpha: { b: 2, a: 1 } },
    });
    const b = buildRequestModel({
        method: 'PUT',
        target: '/ideas/42',
        fields: [
            { name: 'authorization', value: 'Bearer x' },
            { name: 'idempotency-key', value: 'k1' },
        ],
        body: { alpha: { a: 1, b: 2 }, zebra: 1 },
    });
    assert.equal(canonicalJson(a), canonicalJson(b));
});

test('the at string round-trips byte-exact', () => {
    const model = buildRequestModel({
        method: 'PUT', target: '/x', fields: [],
        body: { at: AT },
    });
    assert.ok(canonicalJson(model).includes(AT));
});

test('message hash covers the fields', async () => {
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
    assert.notEqual(
        await requestMessageHash(storedWire(withKey)),
        await requestMessageHash(storedWire(without)),
    );
});

test('documentVersion covers only the body octets',
async () => {
    const a = buildResponseModel({
        status: 200,
        fields: [{ name: 'x-trace', value: 'r1' }],
        body: { v: 1 },
    });
    const b = buildResponseModel({
        status: 200, fields: [], body: { v: 1 },
    });
    const octetsA = HttpMessage.fromModel(a).body()
        .toBytes();
    const octetsB = HttpMessage.fromModel(b).body()
        .toBytes();
    const tagA = await documentVersion(octetsA);
    const tagB = await documentVersion(octetsB);
    assert.equal(tagA, tagB);
    assert.match(tagA, HEX64);
});

test('stored pair message is serializeWire',
async () => {
    const pair = await formWritePair(validInput);
    assert.equal(
        pair.requestMessage.includes('\r\n\r\n'),
        true,
    );
    assert.equal(
        pair.requestMessage.includes('"startLine"'),
        false,
    );
    const model = parseWire(pair.requestMessage);
    assert.equal(model.startLine.kind, 'request');
});

test('stored wire round-trips euro and emoji',
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
    assert.equal(
        JSON.parse(body.toText()).note, '€😀',
    );
});

test('request hash is sha256 of Latin-1 octets',
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
    assert.equal(got, want);
    assert.notEqual(got, await sha256Hex(wire));
});
