import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRequestModel,
    buildResponseModel,
    canonicalJson,
    messageHashOf,
    bodyEtagOf,
} from '../api/message-form.ts';

const AT = '2026-06-15T09:30:00.123456Z';

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
        await messageHashOf(canonicalJson(withKey)),
        await messageHashOf(canonicalJson(without)),
    );
});

test('etag covers only the body', async () => {
    const a = buildResponseModel({
        status: 200,
        fields: [{ name: 'supersedes', value: 'r1' }],
        body: { v: 1 },
    });
    const b = buildResponseModel({
        status: 200, fields: [], body: { v: 1 },
    });
    assert.equal(await bodyEtagOf(a), await bodyEtagOf(b));
});
