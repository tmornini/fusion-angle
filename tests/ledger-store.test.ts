import {
    assertEquals,
    assertNotEquals,
} from '@std/assert';
import {
    NIL_IDENTIFIER,
    encodeIdentifier,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import {
    classifyStatement,
    refusalOf,
} from '../shared/ledger-statement.ts';
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

const PATH = '/migrations/';
const NAME = '0001-example';
const EARLY = '2026-09-23T00:00:00.000001Z';
const HEAD_STAMP = '2026-09-23T00:00:00.000005Z';
const LATER = '2026-09-23T00:00:00.000009Z';

function textBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function identifierAt(byte: number): string {
    const bytes = new Uint8Array(16);
    bytes[15] = byte;
    return encodeIdentifier(bytes);
}

function concatBytes(
    ...parts: readonly Uint8Array[]
): Uint8Array {
    let length = 0;
    for (const part of parts) {
        length += part.length;
    }
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function message(date: string, body: string): Uint8Array {
    return textBytes(
        'HTTP/1.1 201 \r\n'
        + 'date: ' + date + '\r\n'
        + '\r\n'
        + body,
    );
}

const PREFIX = textBytes('HTTP/1.1 201 \r\ndate: ');

function statementRow(fields: {
    id: string,
    operationId: string,
    ifMatch: string | null,
    responsePrefix: Uint8Array,
    responseSuffix: Uint8Array,
    request?: Uint8Array,
    requestSalt?: Uint8Array,
    secret?: Uint8Array,
    responseSalt?: Uint8Array,
    method?: string,
    requesterIdentityId?: string,
}) {
    return {
        id: fields.id,
        operationId: fields.operationId,
        path: PATH,
        name: NAME,
        requesterIdentityId:
            fields.requesterIdentityId ?? 'fa_owner',
        method: fields.method ?? 'PUT',
        request: fields.request ?? textBytes('req'),
        requestSalt: fields.requestSalt
            ?? new Uint8Array(16).fill(0x11),
        secret: fields.secret ?? new Uint8Array(0),
        responsePrefix: fields.responsePrefix,
        responseSuffix: fields.responseSuffix,
        responseSalt: fields.responseSalt
            ?? new Uint8Array(16).fill(0x22),
        ifMatch: fields.ifMatch,
    };
}

Deno.test(
    'a successor stamp follows the head by one microsecond',
    async () => {
        const head = {
            path: PATH,
            name: NAME,
            id: identifierAt(1),
            responseAt: HEAD_STAMP,
            response: message(imfFixdate(HEAD_STAMP), 'old'),
        };
        const suffix = textBytes('\r\n\r\nnew');
        const row = statementRow({
            id: identifierAt(3),
            operationId: identifierAt(4),
            ifMatch: null,
            responsePrefix: PREFIX,
            responseSuffix: suffix,
        });
        const behind = await classifyStatement(
            'blind', [row], [head], EARLY,
        );
        const landed = behind[0]!;
        assertEquals(landed.outcome, 'land');
        assertEquals(
            landed.stamp,
            '2026-09-23T00:00:00.000006Z',
        );
        assertEquals(
            landed.response,
            concatBytes(
                PREFIX,
                textBytes(imfFixdate(landed.stamp)),
                suffix,
            ),
        );

        const ahead = await classifyStatement(
            'blind', [row], [head], LATER,
        );
        assertEquals(ahead[0]!.stamp, LATER);
        assertEquals(ahead[0]!.outcome, 'land');

        const open = await classifyStatement(
            'blind', [row], [], EARLY,
        );
        assertEquals(open[0]!.stamp, EARLY);
        assertEquals(open[0]!.outcome, 'land');
    },
);

Deno.test(
    'a matching body is matched and inserts nothing',
    async () => {
        const now = '2026-09-23T00:00:01.000000Z';
        const headId = identifierAt(1);
        const headResponse = message(
            imfFixdate(HEAD_STAMP),
            'hello',
        );
        const head = {
            path: PATH,
            name: NAME,
            id: headId,
            responseAt: HEAD_STAMP,
            response: headResponse,
        };
        const matched = await classifyStatement(
            'blind',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: null,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [head],
            now,
        );
        const row = matched[0]!;
        assertEquals(row.outcome, 'matched');
        assertEquals(row.inserted, false);
        assertEquals(row.headId, headId);
        assertEquals(row.headResponse, headResponse);
        assertNotEquals(row.response, headResponse);

        const bareHead = textBytes('head-without-body');
        const bare = await classifyStatement(
            'blind',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: null,
                responsePrefix: textBytes('prefix-'),
                responseSuffix: textBytes('-suffix'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: headId,
                responseAt: HEAD_STAMP,
                response: bareHead,
            }],
            now,
        );
        assertEquals(bare[0]!.outcome, 'matched');
        assertEquals(bare[0]!.inserted, false);
        assertNotEquals(bare[0]!.response, bareHead);
    },
);

Deno.test(
    'one stale row reports the whole statement stale',
    async () => {
        const head = {
            path: PATH,
            name: NAME,
            id: identifierAt(1),
            responseAt: HEAD_STAMP,
            response: message(
                imfFixdate(HEAD_STAMP),
                'kept',
            ),
        };
        const rows = await classifyStatement(
            'composed',
            [
                statementRow({
                    id: identifierAt(5),
                    operationId: identifierAt(4),
                    ifMatch: identifierAt(2),
                    responsePrefix: PREFIX,
                    responseSuffix: textBytes('\r\n\r\nkept'),
                }),
                statementRow({
                    id: identifierAt(6),
                    operationId: identifierAt(7),
                    ifMatch: null,
                    responsePrefix: PREFIX,
                    responseSuffix: textBytes(
                        '\r\n\r\nchanged',
                    ),
                }),
            ],
            [head],
            EARLY,
        );
        assertEquals(rows[0]!.outcome, 'stale');
        assertEquals(rows[1]!.outcome, 'stale');
        assertEquals(rows[0]!.inserted, false);
        assertEquals(rows[1]!.inserted, false);
    },
);

Deno.test(
    'genesis lands on the nil predecessor',
    async () => {
        const rows = await classifyStatement(
            'genesis',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: identifierAt(2),
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                response: message(
                    imfFixdate(HEAD_STAMP),
                    'hello',
                ),
            }],
            EARLY,
        );
        const row = rows[0]!;
        assertEquals(row.outcome, 'land');
        assertEquals(row.supersedes, NIL_IDENTIFIER);
        assertEquals(row.inserted, true);
        assertEquals(row.stamp, EARLY);
    },
);

Deno.test(
    'a blind put with no head supersedes nil',
    async () => {
        const now = '2026-09-23T00:00:00.000003Z';
        const id = identifierAt(8);
        const operationId = identifierAt(9);
        const request = textBytes('req');
        const requestSalt = new Uint8Array(16).fill(0x11);
        const secret = new Uint8Array(0);
        const responseSalt = new Uint8Array(16).fill(0x22);
        const responseSuffix = textBytes('\r\n\r\nhello');
        const rows = await classifyStatement(
            'blind',
            [statementRow({
                id,
                operationId,
                ifMatch: null,
                request,
                requestSalt,
                secret,
                responsePrefix: PREFIX,
                responseSuffix,
                responseSalt,
                method: 'PUT',
                requesterIdentityId: 'fa_owner',
            })],
            [],
            now,
        );
        const landed = rows[0]!;
        const spliced = concatBytes(
            PREFIX,
            textBytes(imfFixdate(now)),
            responseSuffix,
        );
        const requestHashHex = await leafHashHex(
            requestSalt, request,
        );
        const secretHex = await secretHashHex(secret);
        const responseHashHex = await leafHashHex(
            responseSalt, spliced,
        );
        assertEquals(landed.outcome, 'land');
        assertEquals(landed.inserted, true);
        assertEquals(landed.supersedes, NIL_IDENTIFIER);
        assertEquals(landed.stamp, now);
        assertEquals(landed.headId, null);
        assertEquals(landed.headResponse, null);
        assertEquals(landed.response, spliced);
        assertEquals(landed.requestHashHex, requestHashHex);
        assertEquals(landed.secretHashHex, secretHex);
        assertEquals(
            landed.responseHashHex,
            responseHashHex,
        );
        assertEquals(
            landed.pairHashHex,
            await pairRootHex({
                id: uuidTextOfIdentifier(id),
                operationId: uuidTextOfIdentifier(
                    operationId,
                ),
                path: PATH,
                name: NAME,
                supersedes: uuidTextOfIdentifier(
                    NIL_IDENTIFIER,
                ),
                requesterIdentityId: 'fa_owner',
                method: 'PUT',
                responseAt: now,
                requestHashHex,
                secretHashHex: secretHex,
                responseHashHex,
            }),
        );
    },
);

Deno.test(
    'an in-order latch of the head lands on it',
    async () => {
        const headId = identifierAt(1);
        const head = {
            path: PATH,
            name: NAME,
            id: headId,
            responseAt: HEAD_STAMP,
            response: message(imfFixdate(HEAD_STAMP), 'old'),
        };
        const decoy = {
            path: PATH,
            name: '0000-root',
            id: identifierAt(2),
            responseAt: HEAD_STAMP,
            response: message(imfFixdate(HEAD_STAMP), 'old'),
        };
        const landed = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: headId,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nnew'),
            })],
            [decoy, head],
            EARLY,
        );
        const row = landed[0]!;
        assertEquals(row.outcome, 'land');
        assertEquals(row.inserted, true);
        assertEquals(row.supersedes, headId);
        assertEquals(
            row.stamp,
            '2026-09-23T00:00:00.000006Z',
        );

        const matched = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: headId,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nold'),
            })],
            [decoy, head],
            EARLY,
        );
        assertEquals(matched[0]!.outcome, 'matched');
        assertEquals(matched[0]!.inserted, false);
    },
);

Deno.test(
    'a matched row reports the whole statement matched',
    async () => {
        const head = {
            path: PATH,
            name: NAME,
            id: identifierAt(1),
            responseAt: HEAD_STAMP,
            response: message(
                imfFixdate(HEAD_STAMP),
                'kept',
            ),
        };
        const rows = await classifyStatement(
            'composed',
            [
                statementRow({
                    id: identifierAt(5),
                    operationId: identifierAt(4),
                    ifMatch: null,
                    responsePrefix: PREFIX,
                    responseSuffix: textBytes('\r\n\r\nkept'),
                }),
                statementRow({
                    id: identifierAt(6),
                    operationId: identifierAt(7),
                    ifMatch: null,
                    responsePrefix: PREFIX,
                    responseSuffix: textBytes(
                        '\r\n\r\nchanged',
                    ),
                }),
            ],
            [head],
            LATER,
        );
        assertEquals(rows[0]!.outcome, 'matched');
        assertEquals(rows[1]!.outcome, 'matched');
        assertEquals(rows[0]!.inserted, false);
        assertEquals(rows[1]!.inserted, false);
    },
);

Deno.test(
    'an in-order latch with no head is stale',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: identifierAt(2),
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [],
            EARLY,
        );
        assertEquals(rows[0]!.outcome, 'stale');
        assertEquals(rows[0]!.inserted, false);
        assertEquals(rows[0]!.stamp, EARLY);
    },
);

Deno.test('a refusal names the document', () => {
    const exists = 'Document already exists at '
        + '/migrations/0001-example';
    const contended =
        'Document remained contended at '
        + '/migrations/0001-example';
    const mismatch =
        'If-Match does not match the current'
        + ' document at /migrations/0001-example';
    assertEquals(
        refusalOf('genesis', 1, PATH, NAME),
        { status: 409, error: exists },
    );
    assertEquals(
        refusalOf('blind', 1, PATH, NAME),
        'retry',
    );
    assertEquals(
        refusalOf('blind', 2, PATH, NAME),
        'retry',
    );
    assertEquals(
        refusalOf('blind', 3, PATH, NAME),
        { status: 409, error: contended },
    );
    assertEquals(
        refusalOf('in-order', 1, PATH, NAME),
        { status: 412, error: mismatch },
    );
    assertEquals(
        refusalOf('composed', 1, PATH, NAME),
        { status: 412, error: mismatch },
    );
});
