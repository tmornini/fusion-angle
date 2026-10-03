import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    EntityNotFoundError,
    RetiredEntityError,
} from '../api/db.ts';
import {
    selectVersionAt,
    selectVersionsAt,
    servedSelection,
    wholeHeadSelection,
    type Lifecycle,
} from '../api/head-reads.ts';
import {
    envelopeOf,
    servedResponse,
    type Reader,
} from '../api/served-response.ts';
import { ledgerFields } from './ledger-row.ts';
import { partsOf } from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import type { MessagePairEntity } from '../shared/types.ts';

const PREFIX = '/version-pin/';
const TABLE = 'documents';
const REQUESTER = 'XXZruirZyAOoRpNxaDnpSA';
const OPERATION = '0123456789ABCDEFGHIJKw';
// The same two lines a head's servedResponse carries.
const TX = {
    date: 'Wed, 30 Sep 2026 12:00:00 GMT',
    requestId: 'ReqReqReqReqReqReqReqQ',
};
const READER: Reader = { sees: 'whole' };

function lines(wire: string): Map<string, string> {
    return new Map(parseWire(wire).fields.map(
        (field) => [field.name, field.value],
    ));
}

function stamp(k: number): string {
    return '2026-01-01T00:00:00.00000' + String(k) + 'Z';
}

function jsonResponse(
    body: Record<string, unknown>,
): string {
    const text = JSON.stringify(body);
    return 'HTTP/1.1 200 OK\r\n'
        + 'content-type: application/json\r\n'
        + 'content-length: ' + String(text.length)
        + '\r\n\r\n'
        + text;
}

// The store-acceptance pairRow shape, with a JSON body.
function pairRow(
    id: string,
    path: string,
    name: string,
    method: string,
    responseAt: string,
    n: number,
    body: Record<string, unknown>,
) {
    return ledgerFields({
        id,
        path,
        name,
        requester_identity_id: REQUESTER,
        method,
        response_at: responseAt,
        request: method + ' ' + path + name
            + ' HTTP/1.1\r\n'
            + 'x-n: ' + String(n) + '\r\n\r\n',
        response: jsonResponse(body),
        operation_id: OPERATION,
        // Distinct supersedes: one PUT or DELETE per
        // (path, name, supersedes).
        supersedes: id,
    });
}

async function open(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

async function land(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    method: string,
    at: number,
    body: Record<string, unknown>,
): Promise<void> {
    await db.messagePairs.append(
        id,
        await pairRow(
            id, PREFIX, name, method, stamp(at), at, body,
        ),
    );
}

async function unreachableMiss(): Promise<never> {
    throw new Error('miss on a written document');
}

function assertHeadLines(wire: string): void {
    assert(wire.startsWith('HTTP/1.1 200 \r\n'));
    const fields = lines(wire);
    assertStrictEquals(fields.get('date'), TX.date);
    assertStrictEquals(
        fields.get('request-id'), TX.requestId,
    );
}

async function assertServedPair(
    response: Response,
    stored: MessagePairEntity,
): Promise<void> {
    const served = servedResponse(
        stored.response, TX, envelopeOf(stored), READER,
    );
    const fields = lines(served);
    assertStrictEquals(response.status, 200);
    assertHeadLines(served);
    for (const [name, value] of fields) {
        assertStrictEquals(
            response.headers.get(name), value,
        );
    }
    const names: string[] = [];
    response.headers.forEach((_value, name) => {
        names.push(name);
    });
    assertEquals(
        [...names].sort(),
        [...fields.keys()].sort(),
    );
    assertStrictEquals(
        await response.text(),
        served.slice(served.indexOf('\r\n\r\n') + 4),
    );
}

Deno.test('versions are the stored PUTs, oldest first',
async () => {
    const db = await open();
    const name = 'doc';
    const oldest = generateIdentifier();
    const middle = generateIdentifier();
    const newest = generateIdentifier();
    // Appended newest-first, so insertion order is not
    // the (response_at, id) order the parts must follow.
    await land(db, newest, name, 'PUT', 3, { n: 3 });
    await land(db, oldest, name, 'PUT', 1, { n: 1 });
    await land(db, middle, name, 'PUT', 2, { n: 2 });
    const selection = await selectVersionsAt(
        db, PREFIX, name, 'stateless', TABLE, READER,
        unreachableMiss,
    );
    assert(selection.kind === 'versions');
    assertEquals(
        selection.pairs.map((pair) => pair.id),
        [oldest, middle, newest],
    );
    const response = servedSelection(selection, TX);
    assertStrictEquals(response.status, 200);
    assertStrictEquals(response.headers.get('date'), TX.date);
    assertStrictEquals(
        response.headers.get('request-id'), TX.requestId,
    );
    assertStrictEquals(response.headers.get('etag'), null);
    assertMatch(
        response.headers.get('content-type') ?? '',
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    const parts = await partsOf(response);
    assertEquals(
        parts.map((part) => part.body().toValue()),
        [{ n: 1 }, { n: 2 }, { n: 3 }],
    );
    const head = servedSelection(wholeHeadSelection(
        await db.messagePairs.getById(oldest),
        'stateless', TABLE, name,
    ), TX);
    const headDate = head.headers.get('date');
    const headRequestId = head.headers.get('request-id');
    await head.body?.cancel();
    const ids = [oldest, middle, newest];
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        const part = parts[i]!;
        const stored = await db.messagePairs.getById(id);
        const wire = part.toWire();
        assertStrictEquals(
            wire,
            servedResponse(
                stored.response, TX,
                envelopeOf(stored), READER,
            ),
        );
        assertHeadLines(wire);
        assertStrictEquals(
            lines(wire).get('date'), headDate,
        );
        assertStrictEquals(
            lines(wire).get('request-id'), headRequestId,
        );
    }
});

Deno.test('versions/:etag serves the PUT the tag names',
async () => {
    const db = await open();
    const name = 'doc';
    const oldest = generateIdentifier();
    const middle = generateIdentifier();
    const newest = generateIdentifier();
    await land(db, newest, name, 'PUT', 3, { n: 3 });
    await land(db, oldest, name, 'PUT', 1, { n: 1 });
    await land(db, middle, name, 'PUT', 2, { n: 2 });
    const selection = await selectVersionAt(
        db, PREFIX, name, middle, 'stateless', TABLE,
        READER, unreachableMiss,
    );
    assert(selection.kind === 'version');
    assertStrictEquals(selection.pair?.id, middle);
    assertStrictEquals(selection.tag, middle);
    const stored = await db.messagePairs.getById(middle);
    const response = servedSelection(selection, TX);
    const asHead = servedSelection(wholeHeadSelection(
        stored, 'stateless', TABLE, name,
    ), TX);
    assertStrictEquals(
        response.headers.get('date'),
        asHead.headers.get('date'),
    );
    assertStrictEquals(
        response.headers.get('request-id'),
        asHead.headers.get('request-id'),
    );
    assertStrictEquals(response.headers.get('date'), TX.date);
    assertStrictEquals(
        response.headers.get('request-id'), TX.requestId,
    );
    const body = await response.text();
    assertStrictEquals(body, await asHead.text());
    assertStrictEquals(body, '{"n":2}');
    await assertServedPair(
        servedSelection(selection, TX),
        stored,
    );
});

async function assertUnknownTag(
    db: MemoryDbAdapter,
    name: string,
    tag: string,
    label: string,
): Promise<void> {
    const selection = await selectVersionAt(
        db, PREFIX, name, tag, 'stateless', TABLE,
        READER, unreachableMiss,
    );
    assert(selection.kind === 'version', label);
    assertStrictEquals(selection.pair, undefined, label);
    const error = assertThrows(
        () => servedSelection(selection, TX),
        EntityNotFoundError,
        undefined,
        label,
    );
    assertStrictEquals(error.table, TABLE, label);
    assertStrictEquals(error.id, tag, label);
}

Deno.test('a tag that names no PUT at the document is'
    + ' not found', async () => {
    const db = await open();
    const name = 'doc';
    const putA = generateIdentifier();
    const deleted = generateIdentifier();
    const putB = generateIdentifier();
    const posted = generateIdentifier();
    const other = generateIdentifier();
    // The DELETE is not the head: a later PUT restored
    // the document, so its id is not a version.
    await land(db, putB, name, 'PUT', 3, { n: 3 });
    await land(db, putA, name, 'PUT', 1, { n: 1 });
    await land(db, deleted, name, 'DELETE', 2, { n: 2 });
    await land(db, posted, name, 'POST', 4, { n: 4 });
    await land(db, other, 'other', 'PUT', 1, { n: 9 });
    const list = await selectVersionsAt(
        db, PREFIX, name, 'stateless', TABLE, READER,
        unreachableMiss,
    );
    assert(list.kind === 'versions');
    assertEquals(
        list.pairs.map((pair) => pair.id),
        [putA, putB],
    );
    await assertUnknownTag(
        db, name, generateIdentifier(), 'no pair',
    );
    await assertUnknownTag(db, name, posted, 'POST');
    await assertUnknownTag(db, name, deleted, 'DELETE');
    await assertUnknownTag(db, name, other, 'other document');
});

function assertGone(
    response: () => Response,
    name: string,
    label: string,
): void {
    const error = assertThrows(
        response,
        RetiredEntityError,
        undefined,
        label,
    );
    assertStrictEquals(error.table, TABLE, label);
    assertStrictEquals(error.id, name, label);
}

async function assertDeletedDocument(
    lifecycle: Lifecycle,
    headState: Record<string, unknown>,
): Promise<void> {
    const db = await open();
    const name = 'doc';
    const earlier = generateIdentifier();
    const head = generateIdentifier();
    await land(db, head, name, 'PUT', 2, headState);
    await land(
        db, earlier, name, 'PUT', 1, { n: 1, state: 'active' },
    );
    const list = await selectVersionsAt(
        db, PREFIX, name, lifecycle, TABLE, READER,
        unreachableMiss,
    );
    assert(list.kind === 'versions');
    assertEquals(
        list.pairs.map((pair) => pair.id),
        [earlier, head],
    );
    assertGone(
        () => servedSelection(list, TX), name, 'list',
    );
    const earlierVersion = await selectVersionAt(
        db, PREFIX, name, earlier, lifecycle, TABLE,
        READER, unreachableMiss,
    );
    assert(earlierVersion.kind === 'version');
    assertStrictEquals(earlierVersion.pair?.id, earlier);
    assertGone(
        () => servedSelection(earlierVersion, TX),
        name, 'earlier PUT',
    );
    const missing = generateIdentifier();
    const namedNothing = await selectVersionAt(
        db, PREFIX, name, missing, lifecycle, TABLE,
        READER, unreachableMiss,
    );
    assert(namedNothing.kind === 'version');
    assertStrictEquals(namedNothing.pair, undefined);
    assertGone(
        () => servedSelection(namedNothing, TX),
        name, 'no tag',
    );
}

Deno.test('a DELETE head is gone before the tag is read',
async () => {
    const db = await open();
    const name = 'doc';
    const earlier = generateIdentifier();
    const head = generateIdentifier();
    await land(db, head, name, 'DELETE', 2, { n: 2 });
    await land(db, earlier, name, 'PUT', 1, { n: 1 });
    const list = await selectVersionsAt(
        db, PREFIX, name, 'stateless', TABLE, READER,
        unreachableMiss,
    );
    assert(list.kind === 'versions');
    assertStrictEquals(list.head.method, 'DELETE');
    assertEquals(
        list.pairs.map((pair) => pair.id), [earlier],
    );
    assertGone(
        () => servedSelection(list, TX), name, 'list',
    );
    const earlierVersion = await selectVersionAt(
        db, PREFIX, name, earlier, 'stateless', TABLE,
        READER, unreachableMiss,
    );
    assert(earlierVersion.kind === 'version');
    assertStrictEquals(earlierVersion.pair?.id, earlier);
    assertGone(
        () => servedSelection(earlierVersion, TX),
        name, 'earlier PUT',
    );
    const missing = generateIdentifier();
    const namedNothing = await selectVersionAt(
        db, PREFIX, name, missing, 'stateless', TABLE,
        READER, unreachableMiss,
    );
    assert(namedNothing.kind === 'version');
    assertStrictEquals(namedNothing.pair, undefined);
    assertGone(
        () => servedSelection(namedNothing, TX),
        name, 'no tag',
    );
});

Deno.test('a state-deleted head is gone on both version'
    + ' reads', async () => {
    await assertDeletedDocument('state', {
        n: 2, state: 'deleted',
    });
});

Deno.test('a document never written throws the family\'s'
    + ' miss', async () => {
    const db = await open();
    const absent = new Error('absent from the family');
    let calls = 0;
    const miss = (): Promise<never> => {
        calls += 1;
        return Promise.reject(absent);
    };
    const versions = await selectVersionsAt(
        db, PREFIX, 'missing', 'stateless', TABLE, READER,
        miss,
    ).then(
        () => undefined,
        (error: unknown) => error,
    );
    assertStrictEquals(calls, 1);
    assertStrictEquals(versions, absent);
    calls = 0;
    const version = await selectVersionAt(
        db, PREFIX, 'missing', generateIdentifier(),
        'stateless', TABLE, READER, miss,
    ).then(
        () => undefined,
        (error: unknown) => error,
    );
    assertStrictEquals(calls, 1);
    assertStrictEquals(version, absent);
});
