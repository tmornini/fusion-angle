import {
    assert,
    assertEquals,
    assertNotEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { runWrite } from '../api/message-pair.ts';
import type { WriteRow } from '../api/message-pair.ts';
import { DATE_PLACEHOLDER } from '../api/ledger-root.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { sha256HexOfBytes } from '../shared/digest.ts';
import {
    NEVER_WRITTEN_IDENTIFIER,
    NIL_IDENTIFIER,
    encodeIdentifier,
    isIdentifier,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import {
    classifyStatement,
} from '../shared/ledger-statement.ts';
import {
    imfFixdate,
    leafHashHex,
    pairRootHex,
    secretsHashHex,
} from '../shared/pair-root.ts';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

Deno.test('pinned row matches the five digests', async () => {
    const request = new TextEncoder().encode('req');
    const requestSalt = new Uint8Array(16).fill(0x11);
    const secrets = new Uint8Array(0);
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
    const requestSecretsHash = await secretsHashHex(secrets);
    const responseHash = await leafHashHex(
        responseSalt, response,
    );
    const responseSecretsHash = await secretsHashHex(secrets);
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
        requestSecretsHashHex: requestSecretsHash,
        responseHashHex: responseHash,
        responseSecretsHashHex: responseSecretsHash,
    });
    assertEquals(
        requestHash,
        'bf60c6295dfe880bfc15db7af6ee2acc1991cf793a765123e035e9c54326ab39',
    );
    assertEquals(
        requestSecretsHash,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assertEquals(
        responseHash,
        '2f3231e1a728bf8d8997752e308dd9e2adbb14dc83fb76d9ee23d7208d6c5f87',
    );
    assertEquals(
        responseSecretsHash,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assertEquals(
        pairHash,
        '22e77480cc694d64d95a938e584337e576af2cb6aec1eec755401b1574ef5b66',
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

Deno.test(
    'pair_hash takes the request secrets before the response'
        + ' secrets',
    async () => {
        const requestSecretsHash = await sha256HexOfBytes(
            textBytes('authorization: Basic abc\r\n'),
        );
        const responseSecretsHash = await sha256HexOfBytes(
            textBytes('set-cookie: a=1\r\n'),
        );
        assertEquals(
            requestSecretsHash,
            'd4aadadce5d1b534fbb86391cee4b8e1'
                + '8cb7ea81773b88df88998625274bd654',
        );
        assertEquals(
            responseSecretsHash,
            '5c5e8214d509be5f783d90e4913ce28a'
                + '0e9d97d8bd4465c05bceb62e54eaa67e',
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
            requestHashHex: 'bf60c6295dfe880bfc15db7af6ee2acc'
                + '1991cf793a765123e035e9c54326ab39',
            requestSecretsHashHex: requestSecretsHash,
            responseHashHex: '2f3231e1a728bf8d8997752e308dd9e2'
                + 'adbb14dc83fb76d9ee23d7208d6c5f87',
            responseSecretsHashHex: responseSecretsHash,
        });
        assertEquals(
            pairHash,
            '861114d59c2019cb8435ac96e5540f49'
                + '769563a92da2b53538afaafa49a38a9e',
        );
    },
);

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
    requestSecrets?: Uint8Array,
    responseSecrets?: Uint8Array,
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
        requestSecrets: fields.requestSecrets
            ?? new Uint8Array(0),
        responsePrefix: fields.responsePrefix,
        responseSuffix: fields.responseSuffix,
        responseSalt: fields.responseSalt
            ?? new Uint8Array(16).fill(0x22),
        responseSecrets: fields.responseSecrets
            ?? new Uint8Array(0),
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
            requesterIdentityId: 'fa_owner',
            response: message(imfFixdate(HEAD_STAMP), 'old'),
            method: 'PUT',
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
                textBytes('HTTP/1.1 200 \r\ndate: '),
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
            requesterIdentityId: 'fa_owner',
            response: headResponse,
            method: 'PUT',
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
                responsePrefix: textBytes(
                    'HTTP/1.1 201 ',
                ),
                responseSuffix: textBytes('-suffix'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: headId,
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: bareHead,
                method: 'PUT',
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
            requesterIdentityId: 'fa_owner',
            response: message(
                imfFixdate(HEAD_STAMP),
                'kept',
            ),
            method: 'PUT',
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
    'a nil latch with no head lands on the nil predecessor',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NIL_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [],
            EARLY,
        );
        const row = rows[0]!;
        assertEquals(row.outcome, 'land');
        assertEquals(row.rawOutcome, 'land');
        assertEquals(row.supersedes, NIL_IDENTIFIER);
        assertEquals(row.inserted, true);
        assertEquals(row.stamp, EARLY);
    },
);

Deno.test(
    'a nil latch over a live put head is stale',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NIL_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: message(
                    imfFixdate(HEAD_STAMP), 'hello',
                ),
                method: 'PUT',
            }],
            EARLY,
        );
        assertEquals(rows[0]!.outcome, 'stale');
        assertEquals(rows[0]!.rawOutcome, 'stale');
        assertEquals(rows[0]!.inserted, false);
    },
);

Deno.test(
    'a nil latch over a tombstone lands and supersedes it',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NIL_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nagain'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: textBytes(
                    'HTTP/1.1 204 \r\ndate: '
                        + imfFixdate(HEAD_STAMP)
                        + '\r\n\r\n',
                ),
                method: 'DELETE',
            }],
            EARLY,
        );
        const row = rows[0]!;
        assertEquals(row.outcome, 'land');
        assertEquals(row.supersedes, identifierAt(1));
        assertEquals(
            row.stamp, '2026-09-23T00:00:00.000006Z',
        );
        assertEquals(
            new TextDecoder().decode(
                row.response.subarray(0, 13),
            ),
            'HTTP/1.1 201 ',
        );
    },
);

Deno.test(
    'a never-written latch with no head lands',
    async () => {
        assert(isIdentifier(NEVER_WRITTEN_IDENTIFIER));
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NEVER_WRITTEN_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [],
            EARLY,
        );
        const row = rows[0]!;
        assertEquals(row.outcome, 'land');
        assertEquals(row.rawOutcome, 'land');
        assertEquals(row.supersedes, NIL_IDENTIFIER);
        assertEquals(row.inserted, true);
        assertEquals(row.headMethod, null);
    },
);

Deno.test(
    'a never-written latch over a live put head is stale',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NEVER_WRITTEN_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: message(
                    imfFixdate(HEAD_STAMP), 'hello',
                ),
                method: 'PUT',
            }],
            EARLY,
        );
        assertEquals(rows[0]!.outcome, 'stale');
        assertEquals(rows[0]!.rawOutcome, 'stale');
        assertEquals(rows[0]!.inserted, false);
        assertEquals(rows[0]!.headMethod, 'PUT');
    },
);

Deno.test(
    'a never-written latch over a tombstone is stale',
    async () => {
        const rows = await classifyStatement(
            'in-order',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: NEVER_WRITTEN_IDENTIFIER,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nagain'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: textBytes(
                    'HTTP/1.1 204 \r\ndate: '
                        + imfFixdate(HEAD_STAMP)
                        + '\r\n\r\n',
                ),
                method: 'DELETE',
            }],
            EARLY,
        );
        const row = rows[0]!;
        assertEquals(row.outcome, 'stale');
        assertEquals(row.rawOutcome, 'stale');
        assertEquals(row.inserted, false);
        assertEquals(row.headMethod, 'DELETE');
    },
);

Deno.test(
    'each answer row carries its own outcome',
    async () => {
        const rows = await classifyStatement(
            'composed',
            [
                statementRow({
                    id: identifierAt(3),
                    operationId: identifierAt(4),
                    ifMatch: identifierAt(2),
                    responsePrefix: PREFIX,
                    responseSuffix: textBytes('\r\n\r\nx'),
                }),
                {
                    ...statementRow({
                        id: identifierAt(5),
                        operationId: identifierAt(4),
                        ifMatch: null,
                        responsePrefix: PREFIX,
                        responseSuffix: textBytes(
                            '\r\n\r\ny',
                        ),
                    }),
                    name: 'other',
                },
            ],
            [{
                path: PATH,
                name: NAME,
                id: identifierAt(1),
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: message(
                    imfFixdate(HEAD_STAMP), 'old',
                ),
                method: 'PUT',
            }],
            EARLY,
        );
        assertEquals(
            rows.map((row) => row.outcome),
            ['stale', 'stale'],
        );
        assertEquals(
            rows.map((row) => row.rawOutcome),
            ['stale', 'land'],
        );
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
        const secrets = new Uint8Array(0);
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
                requestSecrets: secrets,
                responsePrefix: PREFIX,
                responseSuffix,
                responseSalt,
                responseSecrets: secrets,
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
        const secretsHex = await secretsHashHex(secrets);
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
        assertEquals(landed.requestSecretsHashHex, secretsHex);
        assertEquals(
            landed.responseSecretsHashHex, secretsHex,
        );
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
                requestSecretsHashHex: secretsHex,
                responseHashHex,
                responseSecretsHashHex: secretsHex,
            }),
        );
    },
);

Deno.test(
    'pair_hash changes when either secrets column changes',
    async () => {
        const now = '2026-09-23T00:00:00.000003Z';
        const line = textBytes('authorization: Basic abc\r\n');
        const classified = async (fields: {
            requestSecrets?: Uint8Array,
            responseSecrets?: Uint8Array,
        }) => (await classifyStatement(
            'blind',
            [statementRow({
                id: identifierAt(8),
                operationId: identifierAt(9),
                ifMatch: null,
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nhello'),
                ...fields,
            })],
            [],
            now,
        ))[0]!;
        const bare = await classified({});
        const request = await classified({
            requestSecrets: line,
        });
        const response = await classified({
            responseSecrets: line,
        });
        const empty = await sha256HexOfBytes(
            new Uint8Array(0),
        );
        const lineHash = await sha256HexOfBytes(line);
        assertEquals(bare.requestSecretsHashHex, empty);
        assertEquals(bare.responseSecretsHashHex, empty);
        assertEquals(request.requestSecretsHashHex, lineHash);
        assertEquals(request.responseSecretsHashHex, empty);
        assertEquals(response.requestSecretsHashHex, empty);
        assertEquals(response.responseSecretsHashHex, lineHash);
        assertNotEquals(request.pairHashHex, bare.pairHashHex);
        assertNotEquals(response.pairHashHex, bare.pairHashHex);
        assertNotEquals(
            request.pairHashHex, response.pairHashHex,
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
            requesterIdentityId: 'fa_owner',
            response: message(imfFixdate(HEAD_STAMP), 'old'),
            method: 'PUT',
        };
        const decoy = {
            path: PATH,
            name: '0000-root',
            id: identifierAt(2),
            responseAt: HEAD_STAMP,
            requesterIdentityId: 'fa_owner',
            response: message(imfFixdate(HEAD_STAMP), 'old'),
            method: 'PUT',
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
            requesterIdentityId: 'fa_owner',
            response: message(
                imfFixdate(HEAD_STAMP),
                'kept',
            ),
            method: 'PUT',
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
    "a POST row at a document's name never matches",
    async () => {
        const headId = identifierAt(1);
        const rows = await classifyStatement(
            'blind',
            [statementRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                ifMatch: null,
                method: 'POST',
                responsePrefix: PREFIX,
                responseSuffix: textBytes('\r\n\r\nkept'),
            })],
            [{
                path: PATH,
                name: NAME,
                id: headId,
                responseAt: HEAD_STAMP,
                requesterIdentityId: 'fa_owner',
                response: message(
                    imfFixdate(HEAD_STAMP), 'kept',
                ),
                method: 'PUT',
            }],
            LATER,
        );
        assertEquals(rows[0]!.rawOutcome, 'land');
        assertEquals(rows[0]!.outcome, 'land');
        assertEquals(rows[0]!.inserted, true);
        assertEquals(rows[0]!.headId, headId);
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

function openLedger(): {
    backend: MemoryStorageBackend,
    db: BackedDbAdapter,
} {
    const backend = new MemoryStorageBackend();
    const db = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );
    return { backend, db };
}

function wireOf(body: string): Uint8Array {
    return textBytes(
        'HTTP/1.1 201 \r\n'
        + 'date: ' + DATE_PLACEHOLDER + '\r\n'
        + '\r\n'
        + body,
    );
}

function writeRow(fields: {
    id: string,
    operationId: string,
    body: string,
    ifMatch: string | null,
    method?: string,
    name?: string,
}): WriteRow {
    return {
        id: fields.id,
        operationId: fields.operationId,
        path: PATH,
        name: fields.name ?? NAME,
        requesterIdentityId: 'fa_owner',
        method: fields.method ?? 'PUT',
        request: textBytes('req'),
        requestSecrets: new Uint8Array(0),
        response: wireOf(fields.body),
        responseSecrets: new Uint8Array(0),
        ifMatch: fields.ifMatch,
    };
}

async function errorOf(
    response: Response,
): Promise<string> {
    const body = await response.json() as {
        error: string,
    };
    return body.error;
}

Deno.test(
    'runWrite stamps a successor one microsecond later',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'old',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const answer = await runWrite(db, 'blind', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'new',
                ifMatch: null,
            }),
        ], EARLY);
        assertEquals(answer.outcome, 'land');
        assertEquals(
            answer.rows[0]!.stamp,
            '2026-09-23T00:00:00.000006Z',
        );
    },
);

Deno.test(
    'a matched body answers 200 and rings no bell',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runWrite(db, 'blind', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'hello',
                ifMatch: null,
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 200);
        assertEquals(answer.bells, []);
        assertStrictEquals(answer.answeredId, headId);
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
    },
);

// Two live heads for the skip pins: 'same' and 'old'.
async function twoHeads(db: BackedDbAdapter): Promise<{
    same: string,
    old: string,
}> {
    const same = identifierAt(1);
    const old = identifierAt(2);
    await runWrite(db, 'composed', [
        writeRow({
            id: same,
            operationId: identifierAt(3),
            body: 'same',
            ifMatch: null,
            name: 'same',
        }),
        writeRow({
            id: old,
            operationId: identifierAt(3),
            body: 'old',
            ifMatch: null,
            name: 'old',
        }),
    ], HEAD_STAMP);
    return { same, old };
}

async function storedIds(
    db: BackedDbAdapter,
): Promise<string[]> {
    return (await db.messagePairs.getAll()).map(
        (row) => row.id,
    );
}

Deno.test(
    'a matched row beside a landing row is skipped, the'
        + ' rest land',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const heads = await twoHeads(db);
        const kept = identifierAt(5);
        const changed = identifierAt(6);
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: kept,
                operationId: identifierAt(4),
                body: 'same',
                ifMatch: heads.same,
                name: 'same',
            }),
            writeRow({
                id: changed,
                operationId: identifierAt(4),
                body: 'new',
                ifMatch: heads.old,
                name: 'old',
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'land');
        assertEquals(
            answer.rows.map((row) => row.rawOutcome),
            ['matched', 'land'],
        );
        assertEquals(
            answer.rows.map((row) => row.inserted),
            [false, true],
        );
        const stored = await storedIds(db);
        assertEquals(stored.includes(changed), true);
        assertEquals(stored.includes(kept), false);
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'a received pair alone beside matched rows stores'
        + ' nothing',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const heads = await twoHeads(db);
        const before = await storedIds(db);
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: identifierAt(5),
                operationId: identifierAt(4),
                body: 'received',
                ifMatch: null,
                method: 'POST',
                name: 'received',
            }),
            writeRow({
                id: identifierAt(6),
                operationId: identifierAt(4),
                body: 'same',
                ifMatch: heads.same,
                name: 'same',
            }),
            writeRow({
                id: identifierAt(7),
                operationId: identifierAt(4),
                body: 'old',
                ifMatch: null,
                name: 'old',
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'matched');
        assertEquals(
            answer.rows.map((row) => row.rawOutcome),
            ['land', 'matched', 'matched'],
        );
        assertEquals(answer.bells, []);
        assertEquals(await storedIds(db), before);
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'stale still beats matched and land',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const heads = await twoHeads(db);
        const before = await storedIds(db);
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: identifierAt(5),
                operationId: identifierAt(4),
                body: 'next',
                ifMatch: identifierAt(9),
                name: 'stale',
            }),
            writeRow({
                id: identifierAt(6),
                operationId: identifierAt(4),
                body: 'same',
                ifMatch: heads.same,
                name: 'same',
            }),
            writeRow({
                id: identifierAt(7),
                operationId: identifierAt(4),
                body: 'new',
                ifMatch: heads.old,
                name: 'old',
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'stale');
        assertEquals(
            answer.rows.map((row) => row.rawOutcome),
            ['stale', 'matched', 'land'],
        );
        assertEquals(
            answer.rows.map((row) => row.inserted),
            [false, false, false],
        );
        assertEquals(await storedIds(db), before);
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'a declared genesis beside a matched row lands',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const heads = await twoHeads(db);
        const born = identifierAt(5);
        const kept = identifierAt(6);
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: born,
                operationId: identifierAt(4),
                body: 'born',
                ifMatch: NIL_IDENTIFIER,
                name: 'born',
            }),
            writeRow({
                id: kept,
                operationId: identifierAt(4),
                body: 'same',
                ifMatch: heads.same,
                name: 'same',
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'land');
        assertEquals(
            answer.rows.map((row) => row.rawOutcome),
            ['land', 'matched'],
        );
        const stored = await storedIds(db);
        assertEquals(stored.includes(born), true);
        assertEquals(stored.includes(kept), false);
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'a skipped row rings no bell',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const heads = await twoHeads(db);
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: identifierAt(5),
                operationId: identifierAt(4),
                body: 'received',
                ifMatch: null,
                method: 'POST',
                name: 'received',
            }),
            writeRow({
                id: identifierAt(6),
                operationId: identifierAt(4),
                body: 'same',
                ifMatch: heads.same,
                name: 'same',
            }),
            writeRow({
                id: identifierAt(7),
                operationId: identifierAt(4),
                body: 'new',
                ifMatch: heads.old,
                name: 'old',
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'land');
        const inserted = answer.rows.filter(
            (row) => row.inserted,
        );
        assertEquals(
            inserted.map((row) => row.name),
            ['received', 'old'],
        );
        assertStrictEquals(
            answer.bells.length, inserted.length,
        );
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'a stale latch answers 412 and drops its sibling',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const sibling = identifierAt(8);
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runWrite(db, 'composed', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'next',
                ifMatch: identifierAt(9),
            }),
            writeRow({
                id: sibling,
                operationId: identifierAt(5),
                body: 'side',
                ifMatch: null,
                method: 'POST',
                name: 'sibling',
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 412);
        assertEquals(
            await errorOf(answer.response),
            'If-Match does not match the current'
                + ' document at ' + PATH + NAME,
        );
        assertEquals(answer.bells, []);
        const rows = await db.messagePairs.getAll();
        assertStrictEquals(rows.length, before);
        assertEquals(
            rows.some((row) => row.id === sibling),
            false,
        );
    },
);

Deno.test(
    'a second declared genesis answers 412 and keeps the'
        + ' head',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'in-order', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'rootish',
                ifMatch: NIL_IDENTIFIER,
            }),
        ], HEAD_STAMP);
        const answer = await runWrite(db, 'in-order', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'again',
                ifMatch: NIL_IDENTIFIER,
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 412);
        assertEquals(
            await errorOf(answer.response),
            'Document already exists at ' + PATH + NAME,
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(PATH, NAME))
                ?.id,
            headId,
        );
    },
);

Deno.test(
    'a blind conflict then a match answers 200',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const before = backend.statementExecutions();
        backend.refuseNextSuccessions(1);
        const answer = await runWrite(db, 'blind', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'hello',
                ifMatch: null,
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 200);
        assertEquals(answer.bells, []);
        assertStrictEquals(
            backend.statementExecutions(),
            before + 2,
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(PATH, NAME))
                ?.id,
            headId,
        );
    },
);

Deno.test(
    'three blind conflicts answer 409 and keep the head',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const before = backend.statementExecutions();
        backend.refuseNextSuccessions(3);
        const answer = await runWrite(db, 'blind', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'other',
                ifMatch: null,
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 409);
        assertEquals(
            await errorOf(answer.response),
            'Document remained contended at '
                + PATH + NAME,
        );
        assertStrictEquals(
            backend.statementExecutions(),
            before + 3,
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(PATH, NAME))
                ?.id,
            headId,
        );
    },
);

Deno.test(
    'an in-order conflict runs once more and lands',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const before = backend.statementExecutions();
        backend.refuseNextSuccessions(1);
        const answer = await runWrite(db, 'in-order', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'next',
                ifMatch: headId,
            }),
        ], LATER);
        assertStrictEquals(answer.outcome, 'land');
        assertStrictEquals(
            backend.statementExecutions(),
            before + 2,
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(PATH, NAME))
                ?.id,
            identifierAt(3),
        );
    },
);

Deno.test(
    'two in-order conflicts answer 412 naming the row',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        const headId = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id: headId,
                operationId: identifierAt(2),
                body: 'hello',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const before = backend.statementExecutions();
        backend.refuseNextSuccessions(2);
        const answer = await runWrite(db, 'in-order', [
            writeRow({
                id: identifierAt(3),
                operationId: identifierAt(4),
                body: 'next',
                ifMatch: headId,
            }),
        ], LATER);
        assertStrictEquals(answer.response.status, 412);
        assertEquals(
            await errorOf(answer.response),
            'If-Match does not match the current'
                + ' document at ' + PATH + NAME,
        );
        assertStrictEquals(
            backend.statementExecutions(),
            before + 2,
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(PATH, NAME))
                ?.id,
            headId,
        );
    },
);

Deno.test(
    'a primary-key collision still throws',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const id = identifierAt(1);
        await runWrite(db, 'blind', [
            writeRow({
                id,
                operationId: identifierAt(2),
                body: 'one',
                ifMatch: null,
            }),
        ], HEAD_STAMP);
        const error = await assertRejects(
            () => runWrite(db, 'blind', [
                writeRow({
                    id,
                    operationId: identifierAt(4),
                    body: 'two',
                    ifMatch: null,
                    name: 'other',
                }),
            ], LATER),
            Error,
            'duplicate primary key',
        );
        assertEquals(
            (error as { constraint?: string }).constraint,
            'fa_message_pairs_pkey',
        );
        assert(
            (await db.messagePairs.getAll()).some(
                (row) => row.id === id,
            ),
        );
    },
);

const REQUEST_HASH_OF_ZERO_SALT =
    '374708fff7719dd5979ec875d56cd228'
    + '6f6d3cf7ec317a3b25632aab28ec37bb';
const SECRETS_HASH_OF_EMPTY =
    'e3b0c44298fc1c149afbf4c8996fb924'
    + '27ae41e4649b934ca495991b7852b855';

Deno.test(
    'the root row matches the constant leaves',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        assertStrictEquals(backend.statementExecutions(), 1);
        await db.ensureTable();
        assertStrictEquals(backend.statementExecutions(), 1);
        const rows = await db.messagePairs.getAll();
        assertStrictEquals(rows.length, 1);
        const root = rows[0]!;
        assertStrictEquals(root.id, NIL_IDENTIFIER);
        assertStrictEquals(root.supersedes, NIL_IDENTIFIER);
        assertStrictEquals(root.path, '/migrations/');
        assertStrictEquals(root.name, '0000-root');
        assertStrictEquals(root.method, 'PUT');
        assertStrictEquals(
            root.requester_identity_id, 'fa_owner',
        );
        assertStrictEquals(root.request, '');
        assertStrictEquals(root.request_secrets, '');
        assertStrictEquals(root.response_secrets, '');
        assertStrictEquals(root.request_salt, '00'.repeat(16));
        assertStrictEquals(
            root.response_salt, '00'.repeat(16),
        );
        assertStrictEquals(
            root.request_hash, REQUEST_HASH_OF_ZERO_SALT,
        );
        assertStrictEquals(
            root.request_secrets_hash, SECRETS_HASH_OF_EMPTY,
        );
        assertStrictEquals(
            root.response_secrets_hash, SECRETS_HASH_OF_EMPTY,
        );
        assert(root.response.startsWith('HTTP/1.1 201 '));
        assert(root.response.includes(
            'content-length: 64\r\n',
        ));
        assert(root.response.includes(
            'etag: "' + NIL_IDENTIFIER + '"\r\n',
        ));
        assert(root.response.includes(
            'operation-id: ' + root.operation_id + '\r\n',
        ));
        assert(root.response.endsWith(
            '\r\n\r\n' + SECRETS_HASH_OF_EMPTY,
        ));
        assertEquals(
            root.response.includes('request-id'),
            false,
        );
        const responseBytes = Octets.fromLatin1(
            root.response,
        ).asBytes();
        const responseHash = await leafHashHex(
            new Uint8Array(16),
            responseBytes,
        );
        assertStrictEquals(root.response_hash, responseHash);
        const pairHash = await pairRootHex({
            id: uuidTextOfIdentifier(root.id),
            operationId: uuidTextOfIdentifier(
                root.operation_id,
            ),
            path: root.path,
            name: root.name,
            supersedes: uuidTextOfIdentifier(
                root.supersedes,
            ),
            requesterIdentityId: root.requester_identity_id,
            method: root.method,
            responseAt: root.response_at,
            requestHashHex: root.request_hash,
            requestSecretsHashHex: root.request_secrets_hash,
            responseHashHex: root.response_hash,
            responseSecretsHashHex:
                root.response_secrets_hash,
        });
        assertStrictEquals(root.pair_hash, pairHash);
        assertEquals(
            imfFixdate(root.response_at),
            root.response.slice(
                root.response.indexOf('date: ') + 6,
                root.response.indexOf('date: ') + 35,
            ),
        );
    },
);
