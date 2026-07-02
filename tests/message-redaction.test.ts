import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRequestModel,
    buildResponseModel,
    canonicalJson,
} from '../api/message-form.ts';
import {
    redactHeaderCredentials,
    redactAuthenticationRequest,
    redactAuthenticationResponse,
} from '../api/message-redaction.ts';
import { Octets } from '../shared/http-message/octets.ts';
import {
    HttpMessageError,
    type MessageModel,
} from '../shared/http-message/types.ts';

test('authorization header value is fingerprinted',
async () => {
    const model = buildRequestModel({
        method: 'GET', target: '/ideas',
        fields: [
            { name: 'authorization',
              value: 'Bearer SECRET-TOKEN' },
        ],
        body: undefined,
    });
    const redacted =
        await redactHeaderCredentials(model);
    const json = canonicalJson(redacted);
    assert.ok(!json.includes('SECRET-TOKEN'));
    assert.match(json, /sha256:[0-9a-f]{64}/);
});

test('token grant request secrets never survive',
async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/token',
        fields: [],
        body: {
            grant_type: 'refresh',
            refresh_token: 'REFRESH-SECRET',
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/token', model,
    );
    assert.ok(!canonicalJson(redacted)
        .includes('REFRESH-SECRET'));
});

test('the password is PBKDF2-fingerprinted, never sha256',
async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/authorize',
        fields: [],
        body: {
            method: 'password',
            username: 'ada',
            password: 'hunter2',
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/authorize', model,
    );
    const json = canonicalJson(redacted);
    assert.ok(!json.includes('hunter2'));
    assert.match(json, /\$pbkdf2-sha256\$/);
});

test('minted tokens are stripped from the response',
async () => {
    const model = buildResponseModel({
        status: 200, fields: [],
        body: {
            access_token: 'ACCESS-SECRET',
            refresh_token: 'REFRESH-SECRET',
            token_type: 'Bearer',
            expires_in: 900,
        },
    });
    const redacted = await redactAuthenticationResponse(
        'authentication/token', model,
    );
    const json = canonicalJson(redacted);
    assert.ok(!json.includes('ACCESS-SECRET'));
    assert.ok(!json.includes('REFRESH-SECRET'));
});

test('a non-authentication route passes through untouched',
async () => {
    const model = buildRequestModel({
        method: 'PUT', target: '/ideas/42', fields: [],
        body: { title: 'contains password word' },
    });
    const redacted = await redactAuthenticationRequest(
        'ideas/:id', model,
    );
    assert.equal(
        canonicalJson(redacted), canonicalJson(model),
    );
});

test('malformed JSON body on an auth route throws loudly',
async () => {
    const model: MessageModel = {
        startLine: {
            kind: 'request', method: 'POST',
            target: '/authentication/token',
            version: 'HTTP/1.1',
        },
        fields: [
            { name: 'content-type',
              value: 'application/json' },
        ],
        body: Octets.fromLatin1('{not valid json'),
        trailer: undefined,
    };
    await assert.rejects(
        () => redactAuthenticationRequest(
            'authentication/token', model,
        ),
        HttpMessageError,
    );
});

test('an untouched large integer survives redaction verbatim',
async () => {
    const bigInteger = '9007199254740993';
    const bodyText = '{"grant_type":"refresh",'
        + '"refresh_token":"REFRESH-SECRET",'
        + '"expires_hint":' + bigInteger + '}';
    const model: MessageModel = {
        startLine: {
            kind: 'request', method: 'POST',
            target: '/authentication/token',
            version: 'HTTP/1.1',
        },
        fields: [
            { name: 'content-type',
              value: 'application/json' },
        ],
        body: Octets.fromLatin1(bodyText),
        trailer: undefined,
    };
    const redacted = await redactAuthenticationRequest(
        'authentication/token', model,
    );
    const json = canonicalJson(redacted);
    assert.ok(!json.includes('REFRESH-SECRET'));
    assert.ok(json.includes(bigInteger));
});
