import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    projectedBody,
    responseOfWire,
    servedResponse,
    type Reader,
} from '../api/served-response.ts';
import { CREDENTIAL_KEY_READ_ROLES } from
    '../api/family-registry.ts';
import {
    buildResponseModel,
    storedWire,
} from '../api/message-form.ts';
import { formWriteMessagePair } from
    '../api/message-pair.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import type { AttributeSchemaRow } from
    '../shared/record-constraints.ts';

const TRANSMISSION = {
    date: 'Wed, 30 Sep 2026 12:00:00 GMT',
    requestId: 'ReqReqReqReqReqReqReqQ',
};
const WHOLE: Reader = { sees: 'whole' };

function stored(body: unknown): string {
    return storedWire(buildResponseModel({
        status: 201,
        fields: [
            { name: 'date', value:
                'Tue, 29 Sep 2026 08:00:00 GMT' },
            { name: 'etag', value: '"HeadHeadHeadHeadHeadHQ"' },
            { name: 'operation-id',
                value: 'OpOpOpOpOpOpOpOpOpOpOQ' },
            { name: 'request-id',
                value: 'OldOldOldOldOldOldOldQ' },
        ],
        body,
    }));
}

function lines(wire: string): Map<string, string> {
    return new Map(parseWire(wire).fields.map(
        (field) => [field.name, field.value],
    ));
}

function bodyOf(wire: string): string {
    return wire.slice(wire.indexOf('\r\n\r\n') + 4);
}

Deno.test('a read serves the status 200 and this'
    + ' transmission\'s two lines', () => {
    const served = servedResponse(
        stored({ id: 'a' }), TRANSMISSION, WHOLE,
    );
    assert(served.startsWith('HTTP/1.1 200 \r\n'));
    const fields = lines(served);
    assertStrictEquals(fields.get('date'), TRANSMISSION.date);
    assertStrictEquals(
        fields.get('request-id'), TRANSMISSION.requestId,
    );
});

Deno.test('a read keeps etag, operation-id, and'
    + ' content-type as stored', () => {
    const fields = lines(servedResponse(
        stored({ id: 'a' }), TRANSMISSION, WHOLE,
    ));
    assertStrictEquals(
        fields.get('etag'), '"HeadHeadHeadHeadHeadHQ"',
    );
    assertStrictEquals(
        fields.get('operation-id'), 'OpOpOpOpOpOpOpOpOpOpOQ',
    );
    assertStrictEquals(
        fields.get('content-type'), 'application/json',
    );
});

Deno.test('an unprojected body is the stored octets', () => {
    const response = stored({
        name: 'Zoë', big: 12345678901234567890,
    });
    assertStrictEquals(
        bodyOf(servedResponse(response, TRANSMISSION, WHOLE)),
        bodyOf(response),
    );
});

Deno.test('a stored response with no request-id line'
    + ' gains this transmission\'s', () => {
    const seeded = stored({ id: 'a' }).replace(
        'request-id: OldOldOldOldOldOldOldQ\r\n', '',
    );
    assertStrictEquals(
        lines(servedResponse(seeded, TRANSMISSION, WHOLE))
            .get('request-id'),
        TRANSMISSION.requestId,
    );
});

Deno.test('a read serves no credential line', async () => {
    const pair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/identities/'
            + 'IdIdIdIdIdIdIdIdIdIdIQ/token-revocations/'
            + 'RvRvRvRvRvRvRvRvRvRvRQ',
        routePattern:
            'identities/:id/token-revocations/:rid',
        routeSegments: [
            'identities', ':id', 'token-revocations', ':rid',
        ],
        pathSegments: [
            'identities', 'IdIdIdIdIdIdIdIdIdIdIQ',
            'token-revocations', 'RvRvRvRvRvRvRvRvRvRvRQ',
        ],
        headerFields: [],
        body: {},
        requesterIdentityId: 'IdIdIdIdIdIdIdIdIdIdIQ',
        requestAt: '2026-09-30T12:00:00.000000Z',
        organization: undefined,
        responseBody: { id: 'RvRvRvRvRvRvRvRvRvRvRQ' },
        responseFields: [{
            name: 'set-cookie',
            value: 'refresh_token=; Max-Age=0',
        }],
        operationId: 'OpOpOpOpOpOpOpOpOpOpOQ',
        requestId: 'OldOldOldOldOldOldOldQ',
    });
    assertEquals(
        [...lines(servedResponse(
            pair.responseMessage, TRANSMISSION, WHOLE,
        )).keys()].filter((name) => name === 'set-cookie'),
        [],
    );
});

Deno.test('a credential\'s secret reaches no reader,'
    + ' admin included', () => {
    const response = stored({
        at: '2026-09-30T00:00:00.000000Z',
        id: 'c', identity_id: 'i', kind: 'password',
        secret: '$scrypt$ln=17,r=8,p=1$x$y',
        status: 'active',
    });
    const served = servedResponse(response, TRANSMISSION, {
        sees: 'keys',
        readRoles: CREDENTIAL_KEY_READ_ROLES,
        roles: ['admin'],
    });
    const body = bodyOf(served);
    assertStrictEquals(body.includes('secret'), false);
    assertStrictEquals(
        body,
        '{"at":"2026-09-30T00:00:00.000000Z","id":"c",'
            + '"identity_id":"i","kind":"password",'
            + '"status":"active"}',
    );
    assertStrictEquals(
        lines(served).get('content-length'),
        String(body.length),
    );
});

Deno.test('a key projection that drops nothing returns the'
    + ' same octets', () => {
    const body = bodyOf(stored({ id: 'c' }));
    assertStrictEquals(projectedBody(body, {
        sees: 'keys',
        readRoles: CREDENTIAL_KEY_READ_ROLES,
        roles: [],
    }), body);
});

function attribute(
    id: string,
    readRoles: readonly string[],
): AttributeSchemaRow {
    return {
        id,
        name: id,
        attributeType: 'text',
        options: [],
        constraints: [],
        readRoles,
        writeRoles: [],
    };
}

const ATTRIBUTES = new Map<string, AttributeSchemaRow>([
    ['open', attribute('open', ['member'])],
    ['closed', attribute('closed', ['finance'])],
]);

// The closed value is a bare 20-digit number: JSON.parse would
// round it, so the re-serializing path must keep its digits.
const INSTANCE = bodyOf(stored({
    id: 'x', organization_id: 'o', record_type_id: 't',
    values: [
        { attribute_id: 'open', value: '1' },
        { attribute_id: 'closed', value: '12345678901234567890' },
        { attribute_id: 'gone', value: '3' },
    ],
})).replace('"12345678901234567890"', '12345678901234567890');

Deno.test('values keep the attributes the reader may read',
() => {
    assertStrictEquals(
        projectedBody(INSTANCE, {
            sees: 'values', attributesById: ATTRIBUTES,
            roles: ['member'],
        }),
        '{"id":"x","organization_id":"o",'
            + '"record_type_id":"t","values":['
            + '{"attribute_id":"open","value":"1"}]}',
    );
});

Deno.test('an admin reads every attribute the schema holds',
() => {
    assertStrictEquals(
        projectedBody(INSTANCE, {
            sees: 'values', attributesById: ATTRIBUTES,
            roles: ['admin'],
        }),
        '{"id":"x","organization_id":"o",'
            + '"record_type_id":"t","values":['
            + '{"attribute_id":"open","value":"1"},'
            + '{"attribute_id":"closed","value":12345678901234567890}'
            + ']}',
    );
});

const KEYS: Reader = {
    sees: 'keys',
    readRoles: CREDENTIAL_KEY_READ_ROLES,
    roles: [],
};
const VALUES: Reader = {
    sees: 'values', attributesById: ATTRIBUTES, roles: ['admin'],
};
const NOT_AN_OBJECT: unknown[] = [
    null, 7, 'text', [{ secret: 's' }],
];

Deno.test('a keys reader refuses a body that is not an object',
() => {
    for (const shape of NOT_AN_OBJECT) {
        assertThrows(
            () => projectedBody(bodyOf(stored(shape)), KEYS),
            Error, 'not a JSON object', JSON.stringify(shape),
        );
    }
});

Deno.test('a values reader refuses a body that is not an'
    + ' object', () => {
    for (const shape of NOT_AN_OBJECT) {
        assertThrows(
            () => projectedBody(bodyOf(stored(shape)), VALUES),
            Error, 'not a JSON object', JSON.stringify(shape),
        );
    }
});

Deno.test('a values reader refuses an object with no values'
    + ' array', () => {
    assertThrows(
        () => projectedBody(bodyOf(stored({ id: 'x' })), VALUES),
        Error, 'no values array',
    );
});

Deno.test('responseOfWire builds the response from octets',
async () => {
    const wire = servedResponse(
        stored({ name: 'Zoë' }), TRANSMISSION, WHOLE,
    );
    const response = responseOfWire(wire);
    assertStrictEquals(response.status, 200);
    assertStrictEquals(
        response.headers.get('etag'),
        '"HeadHeadHeadHeadHeadHQ"',
    );
    assertEquals(await response.json(), { name: 'Zoë' });
});

// A read role naming a prototype property hides nothing:
// only an own key of the stored body is a credential line,
// and a body with nothing hidden is served as its octets.
Deno.test('a keys reader hides own keys only', () => {
    const body = '{"b":1,"a":2}';
    assertStrictEquals(
        projectedBody(body, {
            sees: 'keys',
            readRoles: new Map<string, readonly string[]>([
                ['constructor', []],
            ]),
            roles: [],
        }),
        body,
    );
});
