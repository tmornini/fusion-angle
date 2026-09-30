import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import {
    formWriteMessagePair,
    latchesOf,
    responseRecordOf,
    runStateWrite,
    sameAsHead,
    writeAnswerOf,
    type MessagePair,
    type SiblingCondition,
    type ParentSibling,
} from '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const IDEA = 'yXVKeCiguypnNcNelXVldQ';
const IDEA_PATH = '/organizations/' + ORGANIZATION
    + '/ideas/';
const MEMBER = 'XXZruirZyAOoRpNxaDnpSA';
const AT = '2026-09-25T00:00:00.000000Z';

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

function received(
    responseBody: unknown,
): Promise<MessagePair> {
    const operationId = generateIdentifier();
    return formWriteMessagePair({
        method: 'POST',
        pathname: IDEA_PATH + IDEA + '/conversion',
        routePattern:
            'organizations/:id/ideas/:id/conversion',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
            'conversion',
        ],
        pathSegments: [
            'organizations', ORGANIZATION, 'ideas', IDEA,
            'conversion',
        ],
        headerFields: [],
        body: { note: 'x' },
        requesterIdentityId: MEMBER,
        requestAt: AT,
        organization: ORGANIZATION,
        responseBody,
        operationId,
        requestId: operationId,
    });
}

function idea(
    state: Record<string, unknown>,
    condition: SiblingCondition,
): ParentSibling {
    return {
        method: 'PUT',
        path: IDEA_PATH,
        name: IDEA,
        state,
        condition,
    };
}

const HANDLER_GENESIS: SiblingCondition = {
    kind: 'genesis', declarer: 'handler',
};

async function born(
    db: BackedDbAdapter,
    state: Record<string, unknown>,
): Promise<string> {
    await runStateWrite(db, {
        kind: 'siblings',
        received: await received(undefined),
        siblings: [idea(state, HANDLER_GENESIS)],
        reader: { sees: 'whole' },
        answer: { kind: 'parent' },
    });
    const head = await db.messagePairs.getHeadPair(
        IDEA_PATH, IDEA,
    );
    assert(head !== null);
    return head.id;
}

Deno.test(
    'a genesis parent answers 201 with its whole state',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const pair = await received(undefined);
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: pair,
            siblings: [idea(
                { id: IDEA, title: 'Born' },
                HANDLER_GENESIS,
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        const head = await db.messagePairs.getHeadPair(
            IDEA_PATH, IDEA,
        );
        assert(head !== null);
        assertStrictEquals(answer.outcome, 'land');
        assertStrictEquals(answer.response.status, 201);
        assertStrictEquals(
            answer.response.headers.get('etag'),
            '"' + head.id + '"',
        );
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'Born' },
        );
        assertEquals(
            responseRecordOf(head.response),
            { id: IDEA, title: 'Born' },
        );
        assertStrictEquals(head.request, '');
        assertStrictEquals(writeAnswerOf(pair), answer);
    },
);

Deno.test(
    'every row of a state write shares one operation id',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const pair = await received(undefined);
        await runStateWrite(db, {
            kind: 'siblings',
            received: pair,
            siblings: [
                idea({ id: IDEA, title: 'Born' },
                    HANDLER_GENESIS),
                {
                    method: 'PUT',
                    path: IDEA_PATH,
                    name: 'second',
                    state: { id: 'second' },
                    condition: HANDLER_GENESIS,
                },
            ],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        const rows = (await db.messagePairs.getAll())
            .filter((row) =>
                row.operation_id === pair.operationId);
        assertStrictEquals(rows.length, 3);
    },
);

// The received pair's response is formed anew, so the
// secrets stored and spliced beside it are the formed
// response's own hoisted lines, none here.
Deno.test(
    'a completed pair stores its formed response\'s secrets',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const operationId = generateIdentifier();
        const pair = await formWriteMessagePair({
            method: 'POST',
            pathname: IDEA_PATH + IDEA + '/conversion',
            routePattern:
                'organizations/:id/ideas/:id/conversion',
            routeSegments: [
                'organizations', ':id', 'ideas', ':id',
                'conversion',
            ],
            pathSegments: [
                'organizations', ORGANIZATION, 'ideas', IDEA,
                'conversion',
            ],
            headerFields: [],
            body: { note: 'x' },
            requesterIdentityId: MEMBER,
            requestAt: AT,
            organization: ORGANIZATION,
            responseBody: undefined,
            responseFields: [
                { name: 'set-cookie', value: 'received=1' },
            ],
            operationId,
            requestId: operationId,
        });
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: pair,
            siblings: [idea(
                { id: IDEA, title: 'Born' },
                HANDLER_GENESIS,
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'land');
        assertStrictEquals(
            answer.response.headers.get('set-cookie'), null,
        );
        await answer.response.body?.cancel();
        const stored = (await db.messagePairs.getAll()).find(
            (row) => row.id === pair.id,
        );
        assert(stored !== undefined);
        assertStrictEquals(stored.response_secrets, '');
    },
);

Deno.test(
    'a created parent answers its location',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'Born' },
                HANDLER_GENESIS,
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'created', location: IDEA },
        });
        assertStrictEquals(answer.response.status, 201);
        assertStrictEquals(
            answer.response.headers.get('location'), IDEA,
        );
        await answer.response.body?.cancel();
    },
);

Deno.test(
    'an in-order parent answers 200 with its new state',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = await born(db, { id: IDEA, title: 'A' });
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'B' },
                { kind: 'in-order', head: headId },
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.response.status, 200);
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'B' },
        );
    },
);

Deno.test(
    'a stale sibling answers 412 and stores nothing',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        await born(db, { id: IDEA, title: 'A' });
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'B' },
                { kind: 'in-order', head: generateIdentifier() },
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.response.status, 412);
        assertEquals(
            await answer.response.json(),
            {
                error: 'If-Match does not match the current'
                    + ' document at ' + IDEA_PATH + IDEA,
            },
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);

Deno.test(
    'a taken name is 409 for the handler, 412 for a client',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        await born(db, { id: IDEA, title: 'A' });
        for (const [declarer, status] of [
            ['handler', 409], ['client', 412],
        ] as const) {
            const answer = await runStateWrite(db, {
                kind: 'siblings',
                received: await received(undefined),
                siblings: [idea(
                    { id: IDEA, title: 'A' },
                    { kind: 'genesis', declarer },
                )],
                reader: { sees: 'whole' },
                answer: { kind: 'created', location: IDEA },
            });
            assertStrictEquals(answer.response.status, status);
            assertEquals(
                await answer.response.json(),
                {
                    error: 'Document already exists at '
                        + IDEA_PATH + IDEA,
                },
            );
        }
    },
);

Deno.test(
    'a never-written sibling over a tombstone answers 410',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = await born(db, { id: IDEA, title: 'A' });
        await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [
                {
                    method: 'PUT',
                    path: IDEA_PATH,
                    name: 'second',
                    state: { id: 'second' },
                    condition: HANDLER_GENESIS,
                },
                {
                    method: 'DELETE',
                    path: IDEA_PATH,
                    name: IDEA,
                    condition: { kind: 'in-order', head: headId },
                },
            ],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        const tombstone = await db.messagePairs.getHeadPair(
            IDEA_PATH, IDEA,
        );
        assert(tombstone !== null);
        assertStrictEquals(tombstone.method, 'DELETE');
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'Again' },
                { kind: 'never-written', declarer: 'client' },
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'stale');
        assertStrictEquals(answer.response.status, 410);
        assertEquals(
            await answer.response.json(),
            {
                error: 'Document is gone at '
                    + IDEA_PATH + IDEA,
            },
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);

Deno.test(
    'a never-written sibling over a live head answers 412'
        + ' for a client',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        await born(db, { id: IDEA, title: 'A' });
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'A' },
                { kind: 'never-written', declarer: 'client' },
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.response.status, 412);
        assertEquals(
            await answer.response.json(),
            {
                error: 'Document already exists at '
                    + IDEA_PATH + IDEA,
            },
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);

Deno.test(
    'an unchanged parent answers its head, storing nothing',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = await born(db, {
            id: IDEA, title: 'A', hidden: 'h',
        });
        const head = await db.messagePairs.getHeadPair(
            IDEA_PATH, IDEA,
        );
        assert(head !== null);
        assertStrictEquals(
            sameAsHead(
                head, { id: IDEA, title: 'A', hidden: 'h' },
            ),
            true,
        );
        const before = (await db.messagePairs.getAll())
            .length;
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'A', hidden: 'h' },
                { kind: 'in-order', head: headId },
            )],
            reader: {
                sees: 'keys',
                readRoles: new Map([['hidden', []]]),
                roles: [],
            },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'matched');
        assertStrictEquals(answer.response.status, 200);
        assertStrictEquals(
            answer.response.headers.get('etag'),
            '"' + headId + '"',
        );
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'A' },
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length, before,
        );
    },
);

Deno.test(
    'the received row stores the whole state; the wire'
        + ' is projected',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const headId = await born(db, { id: IDEA, title: 'A' });
        const pair = await received(undefined);
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: pair,
            siblings: [idea(
                { id: IDEA, title: 'A', hidden: 'written' },
                { kind: 'in-order', head: headId },
            )],
            reader: {
                sees: 'keys',
                readRoles: new Map([['hidden', []]]),
                roles: [],
            },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'land');
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'A' },
        );
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.id === pair.id);
        assert(stored !== undefined);
        assertEquals(
            responseRecordOf(stored.response),
            { id: IDEA, title: 'A', hidden: 'written' },
        );
    },
);

Deno.test(
    'a refused state write is judged by one re-run',
    async () => {
        const { backend, db } = openLedger();
        await db.ensureTable();
        const before = backend.statementExecutions();
        backend.refuseNextSuccessions(1);
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [idea(
                { id: IDEA, title: 'Born' },
                HANDLER_GENESIS,
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'land');
        assertStrictEquals(
            backend.statementExecutions(), before + 2,
        );
        await answer.response.body?.cancel();
    },
);

// Refused twice, the statement states no head: a spent name
// cannot be told from a live one, so a never-written latch
// is a conflict; a nil latch answers its declarer.
Deno.test(
    'a genesis refused twice answers by its latch',
    async () => {
        const cases: readonly [SiblingCondition, number][] = [
            [{ kind: 'never-written', declarer: 'client' }, 409],
            [{ kind: 'genesis', declarer: 'client' }, 412],
            [HANDLER_GENESIS, 409],
        ];
        for (const [condition, status] of cases) {
            const { backend, db } = openLedger();
            await db.ensureTable();
            const before = backend.statementExecutions();
            backend.refuseNextSuccessions(2);
            const answer = await runStateWrite(db, {
                kind: 'siblings',
                received: await received(undefined),
                siblings: [idea(
                    { id: IDEA, title: 'Born' }, condition,
                )],
                reader: { sees: 'whole' },
                answer: { kind: 'parent' },
            });
            assertStrictEquals(answer.outcome, 'refused');
            assertStrictEquals(
                answer.response.status, status, condition.kind,
            );
            assertEquals(await answer.response.json(), {
                error: 'Document already exists at '
                    + IDEA_PATH + IDEA,
            });
            assertStrictEquals(
                backend.statementExecutions(), before + 2,
            );
            assertStrictEquals(
                await db.messagePairs.getHeadPair(IDEA_PATH, IDEA),
                null,
            );
        }
    },
);

Deno.test(
    'a received answer keeps the pair it was formed with',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: await received({ granted: true }),
            siblings: [idea(
                { id: IDEA, title: 'Born' },
                HANDLER_GENESIS,
            )],
            reader: { sees: 'whole' },
            answer: { kind: 'received' },
        });
        assertStrictEquals(answer.outcome, 'land');
        assertEquals(
            await answer.response.json(),
            { granted: true },
        );
    },
);

Deno.test(
    'an own write stores the state it was given',
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const operationId = generateIdentifier();
        const pair = await formWriteMessagePair({
            method: 'PUT',
            pathname: IDEA_PATH + IDEA,
            routePattern: 'organizations/:id/ideas/:id',
            routeSegments: [
                'organizations', ':id', 'ideas', ':id',
            ],
            pathSegments: [
                'organizations', ORGANIZATION, 'ideas', IDEA,
            ],
            headerFields: [],
            body: { title: 'Fields' },
            requesterIdentityId: MEMBER,
            requestAt: AT,
            organization: ORGANIZATION,
            responseBody: undefined,
            operationId,
            requestId: operationId,
        });
        const answer = await runStateWrite(db, {
            kind: 'own',
            received: pair,
            state: { id: IDEA, title: 'Fields', facet: 1 },
        });
        assertStrictEquals(answer.response.status, 201);
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'Fields', facet: 1 },
        );
        assertStrictEquals(writeAnswerOf(pair), answer);
    },
);

Deno.test(
    'an unchanged parent beside a changed sibling answers'
        + " the parent's head",
    async () => {
        const { db } = openLedger();
        await db.ensureTable();
        const second = {
            method: 'PUT' as const,
            path: IDEA_PATH,
            name: 'second',
            state: { id: 'second', n: 1 },
            condition: HANDLER_GENESIS,
        };
        await runStateWrite(db, {
            kind: 'siblings',
            received: await received(undefined),
            siblings: [
                idea({ id: IDEA, title: 'A' }, HANDLER_GENESIS),
                second,
            ],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        const ideaHead = await db.messagePairs.getHeadPair(
            IDEA_PATH, IDEA,
        );
        const secondHead = await db.messagePairs.getHeadPair(
            IDEA_PATH, 'second',
        );
        assert(ideaHead !== null);
        assert(secondHead !== null);
        const pair = await received(undefined);
        const answer = await runStateWrite(db, {
            kind: 'siblings',
            received: pair,
            siblings: [
                {
                    method: 'PUT',
                    path: IDEA_PATH,
                    name: IDEA,
                    state: { id: IDEA, title: 'A' },
                    condition: {
                        kind: 'in-order',
                        head: ideaHead.id,
                        read: ideaHead,
                    },
                },
                {
                    ...second,
                    state: { id: 'second', n: 2 },
                    condition: {
                        kind: 'in-order',
                        head: secondHead.id,
                    },
                },
            ],
            reader: { sees: 'whole' },
            answer: { kind: 'parent' },
        });
        assertStrictEquals(answer.outcome, 'land');
        assertStrictEquals(answer.response.status, 200);
        assertStrictEquals(answer.answeredId, ideaHead.id);
        assertStrictEquals(
            answer.response.headers.get('etag'),
            '"' + ideaHead.id + '"',
        );
        assertEquals(
            await answer.response.json(),
            { id: IDEA, title: 'A' },
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(IDEA_PATH, IDEA))
                ?.id,
            ideaHead.id,
        );
        const secondNow = await db.messagePairs.getHeadPair(
            IDEA_PATH, 'second',
        );
        assert(secondNow !== null);
        assertEquals(
            responseRecordOf(secondNow.response),
            { id: 'second', n: 2 },
        );
        const inserted = answer.rows
            .filter((row) => row.inserted)
            .map((row) => row.id);
        assertEquals(inserted, [pair.id, secondNow.id]);
        assertStrictEquals(answer.bells.length, inserted.length);
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.id === pair.id);
        assert(stored !== undefined);
        assertStrictEquals(
            stored.response.includes(
                '\r\netag: "' + ideaHead.id + '"\r\n',
            ),
            true,
        );
    },
);

Deno.test('latches pair tags with the heads read', () => {
    const [a, b] = [generateIdentifier(), generateIdentifier()];
    assertEquals(
        latchesOf([b, a], [a, b]),
        { kind: 'latched', heads: [a, b] },
    );
    const stale = generateIdentifier();
    assertEquals(
        latchesOf([stale, b], [a, b]),
        { kind: 'latched', heads: [stale, b] },
    );
    assertEquals(
        latchesOf([a], [a, b]),
        { kind: 'missing', documents: [1] },
    );
    const c = generateIdentifier();
    assertEquals(
        latchesOf([b], [a, b, c]),
        { kind: 'missing', documents: [0, 2] },
    );
    assertEquals(
        latchesOf([], [a, b]),
        { kind: 'missing', documents: [0, 1] },
    );
    assertEquals(
        latchesOf([a, b, stale], [a, b]),
        { kind: 'extra' },
    );
    assertEquals(
        latchesOf([a], [null]),
        { kind: 'latched', heads: [a] },
    );
});
