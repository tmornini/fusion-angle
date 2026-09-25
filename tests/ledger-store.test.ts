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
            method: 'PUT',
        };
        const decoy = {
            path: PATH,
            name: '0000-root',
            id: identifierAt(2),
            responseAt: HEAD_STAMP,
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
    const contended =
        'Document remained contended at '
        + '/migrations/0001-example';
    const mismatch =
        'If-Match does not match the current'
        + ' document at /migrations/0001-example';
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
        secret: new Uint8Array(0),
        response: wireOf(fields.body),
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
const SECRET_HASH_OF_EMPTY =
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
        assertStrictEquals(root.secret, '');
        assertStrictEquals(root.request_salt, '00'.repeat(16));
        assertStrictEquals(
            root.response_salt, '00'.repeat(16),
        );
        assertStrictEquals(
            root.request_hash, REQUEST_HASH_OF_ZERO_SALT,
        );
        assertStrictEquals(
            root.secret_hash, SECRET_HASH_OF_EMPTY,
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
            '\r\n\r\n' + SECRET_HASH_OF_EMPTY,
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
            secretHashHex: root.secret_hash,
            responseHashHex: root.response_hash,
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
