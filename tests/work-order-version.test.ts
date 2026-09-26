import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    boundVersion,
    claimedVersion,
    createdVersion,
    fieldsVersion,
    historyOf,
    isClaimLive,
    releasedVersion,
    transitionedVersion,
    type WorkOrderVersion,
} from '../api/work-order-version.ts';

const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const WORK_ORDER = 'xqcXYHXBJJXcLkRYkRngKA';
const ALICE = 'XXZruirZyAOoRpNxaDnpSA';
const BOB = 'yatHlUsoiwxMlkqjKvCVGQ';
const FIELDS = {
    display_id: 'WO-1',
    flow_graph: { nodes: [], edges: [] },
    position: 1,
};
const T0 = '2026-09-25T10:00:00.000000Z';
const T1 = '2026-09-25T10:00:01.000000Z';
const T2 = '2026-09-25T10:00:02.000000Z';
const LOCK = 300;
const EXPIRES = '2026-09-25T10:05:02.000000Z';

function created(): WorkOrderVersion {
    return createdVersion({
        id: WORK_ORDER,
        organization_id: ORGANIZATION,
        fields: FIELDS,
        births: [
            { id: 'e0', state: 'start', at: T0 },
            { id: 'e1', state: 'node-1', at: T1 },
            { id: 'e2', state: 'claimed', at: T2 },
        ],
        creator: ALICE,
        lockTimeoutSeconds: LOCK,
    });
}

Deno.test('a created version holds three births and a claim',
() => {
    const version = created();
    assertEquals(Object.keys(version), [
        'id', 'organization_id', 'display_id', 'flow_graph',
        'position', 'state', 'claim', 'events',
    ]);
    assertStrictEquals(version.state, 'node-1');
    assertEquals(version.claim, {
        member_id: ALICE, at: T2, expires_at: EXPIRES,
    });
    assertEquals(version.events.map((e) => e.state), [
        'start', 'node-1', 'claimed',
    ]);
    assertEquals(
        version.events.map((e) => e.member_id),
        [ALICE, ALICE, ALICE],
    );
});

Deno.test('a fields version keeps the facets, no events',
() => {
    const version = fieldsVersion(created(), {
        ...FIELDS, position: 2,
    });
    assertStrictEquals(version.position, 2);
    assertStrictEquals(version.state, 'node-1');
    assertEquals(version.claim, created().claim);
    assertEquals(version.events, []);
});

Deno.test('a version born by PUT has no state', () => {
    const version = fieldsVersion(
        { id: WORK_ORDER, organization_id: ORGANIZATION },
        FIELDS,
    );
    assertEquals(Object.keys(version), [
        'id', 'organization_id', 'display_id', 'flow_graph',
        'position', 'events',
    ]);
});

Deno.test('a foreign live claim holds', () => {
    const change = claimedVersion(created(), {
        member: BOB,
        claimEventId: 'c1', claimAt: T2,
        expireEventId: 'x1', expireAt: T2,
        expiresAt: EXPIRES,
        now: T2,
    });
    assertEquals(change, { kind: 'held', by: ALICE });
});

Deno.test('a claim at the expiry instant finds it lapsed',
() => {
    const change = claimedVersion(created(), {
        member: BOB,
        claimEventId: 'c1', claimAt: EXPIRES,
        expireEventId: 'x1', expireAt: EXPIRES,
        expiresAt: '2026-09-25T10:10:02.000000Z',
        now: EXPIRES,
    });
    assertStrictEquals(change.kind, 'claimed');
    if (change.kind !== 'claimed') return;
    assertEquals(change.version.events.map((e) => [
        e.id, e.state, e.member_id,
    ]), [
        ['x1', 'claim_expired', ALICE],
        ['c1', 'claimed', BOB],
    ]);
    assertEquals(change.version.claim?.member_id, BOB);
});

Deno.test('the holder resending its claim changes nothing',
() => {
    const head = created();
    const change = claimedVersion(head, {
        member: ALICE,
        claimEventId: 'e2', claimAt: T2,
        expireEventId: 'x1', expireAt: T2,
        expiresAt: EXPIRES,
        now: T2,
    });
    assertStrictEquals(change.kind, 'claimed');
    if (change.kind !== 'claimed') return;
    assertEquals(change.version.claim, head.claim);
});

Deno.test('a release drops a live claim and records it', () => {
    const released = releasedVersion(created(), {
        eventId: 'r1', member: ALICE, at: T2, now: T2,
    });
    assertStrictEquals(released.claim, undefined);
    assertEquals(released.events.map((e) => [
        e.id, e.state,
    ]), [['r1', 'claim_released']]);
});

Deno.test('a release with no live claim is the head', () => {
    const head = releasedVersion(created(), {
        eventId: 'r1', member: ALICE, at: T2, now: T2,
    });
    assertStrictEquals(
        releasedVersion(head, {
            eventId: 'r2', member: ALICE, at: T2, now: T2,
        }),
        head,
    );
});

Deno.test('a transition moves the node and may release', () => {
    const moved = transitionedVersion(created(), {
        eventId: 't1', targetState: 'node-2', member: ALICE,
        at: T2, fieldValueEntities: [],
        release: { kind: 'released', id: 'r1', at: T2 },
    });
    assertStrictEquals(moved.state, 'node-2');
    assertStrictEquals(moved.claim, undefined);
    assertEquals(moved.events.map((e) => e.state), [
        'node-2', 'claim_released',
    ]);
});

Deno.test('a binding is set once; a rebind conflicts', () => {
    const bound = boundVersion(created(), 'i1', 'rt1');
    assertStrictEquals(bound.kind, 'bound');
    if (bound.kind !== 'bound') return;
    assertStrictEquals(bound.version.instance_id, 'i1');
    assertEquals(bound.version.events, []);
    assertEquals(
        boundVersion(bound.version, 'i1', 'rt1'),
        { kind: 'bound', version: bound.version },
    );
    assertEquals(
        boundVersion(bound.version, 'i2', 'rt1'),
        { kind: 'rebound', to: 'i1' },
    );
});

Deno.test('history is every version\'s events, newest first',
() => {
    const first = created();
    const second = releasedVersion(first, {
        eventId: 'r1', member: ALICE, at: T2, now: T2,
    });
    assertEquals(
        historyOf([first, second]).map((e) => e.id),
        ['r1', 'e2', 'e1', 'e0'],
    );
});

Deno.test('a claim is live strictly before it expires', () => {
    const claim = created().claim!;
    assertStrictEquals(isClaimLive(claim, T2), true);
    assertStrictEquals(isClaimLive(claim, EXPIRES), false);
});
