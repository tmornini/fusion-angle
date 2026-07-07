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
    stripPiiRequest,
} from '../api/message-redaction.ts';
import { Octets } from '../shared/http-message/octets.ts';
import {
    HttpMessageError,
    type MessageModel,
} from '../shared/http-message/types.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { sha256Hex } from '../shared/digest.ts';

// The redacted body, decoded — for tests asserting an EXACT
// fingerprint value rather than merely a pattern's presence.
function bodyOf(model: MessageModel): Record<string, unknown> {
    return JSON.parse(
        HttpMessage.fromModel(model).body().toText(),
    ) as Record<string, unknown>;
}

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

test('a live authorization code is fingerprinted on the'
+ ' token request arm', async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/token',
        fields: [],
        body: {
            grant_type: 'authorization_code',
            code: 'AUTH-CODE-SECRET',
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/token', model,
    );
    const body = bodyOf(redacted);
    assert.equal(
        body.code,
        'sha256:' + await sha256Hex('AUTH-CODE-SECRET'),
    );
    assert.ok(!canonicalJson(redacted)
        .includes('AUTH-CODE-SECRET'));
});

test('a present code on the authorize request arm is'
+ ' equally fingerprinted', async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/authorize',
        fields: [],
        body: {
            method: 'authorization_code',
            code: 'AUTH-CODE-SECRET',
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/authorize', model,
    );
    const body = bodyOf(redacted);
    assert.equal(
        body.code,
        'sha256:' + await sha256Hex('AUTH-CODE-SECRET'),
    );
    assert.ok(!canonicalJson(redacted)
        .includes('AUTH-CODE-SECRET'));
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

test('a minted authorization code is fingerprinted on the'
+ ' authorize response arm', async () => {
    const model = buildResponseModel({
        status: 200, fields: [],
        body: { code: 'AUTH-CODE-SECRET' },
    });
    const redacted = await redactAuthenticationResponse(
        'authentication/authorize', model,
    );
    const body = bodyOf(redacted);
    assert.equal(
        body.code,
        'sha256:' + await sha256Hex('AUTH-CODE-SECRET'),
    );
    assert.ok(!canonicalJson(redacted)
        .includes('AUTH-CODE-SECRET'));
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

// A stray, GRANT-IRRELEVANT non-string field (e.g. a
// refresh-grant field on an authorization_code exchange) must
// redact cleanly, never throw — the redactor applies ONE static
// field list per ROUTE, not per grant_type, so a field a given
// grant never reads still passes through this module. The
// fingerprint is over the value's canonical JSON text (the
// ES2025 raw-JSON holder for a bare top-level number stringifies
// to its exact source text), so it is independently
// recomputable and must match exactly — a mere "is redacted"
// check would miss a determinism regression.
test('a present non-string high-entropy field is redacted over'
+ ' its canonical JSON text, never thrown', async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/token',
        fields: [],
        body: {
            grant_type: 'authorization_code',
            code: 'the-code',
            refresh_token: 12345,
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/token', model,
    );
    const body = bodyOf(redacted);
    assert.equal(
        body.refresh_token,
        'sha256:' + await sha256Hex('12345'),
    );
    assert.ok(
        !canonicalJson(redacted).includes(':12345'),
        'the live integer must not survive verbatim',
    );
});

test('a present non-string password is PBKDF2-hashed over its'
+ ' canonical JSON text, never thrown', async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/authorize',
        fields: [],
        body: {
            method: 'password',
            username: 'ada',
            password: 12345,
        },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/authorize', model,
    );
    const body = bodyOf(redacted);
    assert.match(body.password as string, /\$pbkdf2-sha256\$/);
    assert.ok(!canonicalJson(redacted).includes(':12345'));
});

test('redacting the same non-string stray field twice yields'
+ ' the identical fingerprint (determinism pin)', async () => {
    const body = {
        grant_type: 'authorization_code',
        code: 'the-code',
        refresh_token: 12345,
    };
    const first = bodyOf(await redactAuthenticationRequest(
        'authentication/token',
        buildRequestModel({
            method: 'POST', target: '/authentication/token',
            fields: [], body,
        }),
    ));
    const second = bodyOf(await redactAuthenticationRequest(
        'authentication/token',
        buildRequestModel({
            method: 'POST', target: '/authentication/token',
            fields: [], body,
        }),
    ));
    assert.equal(first.refresh_token, second.refresh_token);
});

test('an absent high-entropy field stays absent, no throw',
async () => {
    const model = buildRequestModel({
        method: 'POST',
        target: '/authentication/token',
        fields: [],
        body: { grant_type: 'client_credentials' },
    });
    const redacted = await redactAuthenticationRequest(
        'authentication/token', model,
    );
    assert.equal(
        canonicalJson(redacted), canonicalJson(model),
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

// The PII strip arm (gate 2): unlike the high-entropy secrets
// above, an email or username is low-entropy and identifying —
// fingerprinting it would leak exactly what it claims to
// protect (dictionary/rainbow attack against a small address
// space), so the ONLY safe treatment is removal — absence,
// never a sentinel.
test('a grant-shaped body has its email stripped from the'
+ ' stored request; every other field survives', async () => {
    const model = buildRequestModel({
        method: 'POST', target: '/invitations', fields: [],
        body: {
            email: 'sarah@x.com', invitationId: 'inv-1',
            grantEventId: 'ev-1',
            grantAt: '2026-01-01T00:00:00.000000Z',
        },
    });
    const stripped = await stripPiiRequest('invitations', model);
    const body = bodyOf(stripped);
    assert.ok(!('email' in body));
    assert.equal(body.invitationId, 'inv-1');
    assert.equal(body.grantEventId, 'ev-1');
    assert.equal(
        body.grantAt, '2026-01-01T00:00:00.000000Z',
    );
});

test('an authorize-shaped body has its username stripped from'
+ ' the stored request; every other field survives',
async () => {
    const model = buildRequestModel({
        method: 'POST', target: '/authentication/authorize',
        fields: [],
        body: {
            method: 'password', username: 'ada@example.com',
            password: 'hunter2', client_id: 'web',
        },
    });
    const stripped = await stripPiiRequest(
        'authentication/authorize', model,
    );
    const body = bodyOf(stripped);
    assert.ok(!('username' in body));
    assert.equal(body.method, 'password');
    assert.equal(body.password, 'hunter2');
    assert.equal(body.client_id, 'web');
});

test('a non-listed route\'s body passes through the PII strip'
+ ' untouched', async () => {
    const model = buildRequestModel({
        method: 'POST', target: '/authentication/token',
        fields: [],
        body: {
            grant_type: 'refresh',
            refresh_token: 'REFRESH-SECRET',
        },
    });
    const stripped = await stripPiiRequest(
        'authentication/token', model,
    );
    assert.equal(
        canonicalJson(stripped), canonicalJson(model),
    );
});
