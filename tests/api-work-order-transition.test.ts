import {
    assert,
    assertEquals,
    assertInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';
import { RequestError } from '../api/api.ts';
import { GET, POST, PUT } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    ValidationError,
} from '../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import {
    postSeedWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { seedCreatedWorkOrder } from
    './work-order-fixtures.ts';


const FIELD_VALUE_ID = generateIdentifier();
const CLAIM_EVENT_ID = generateIdentifier();
const EXPIRE_EVENT_ID = generateIdentifier();
const RELEASE_EVENT_ID = generateIdentifier();
const TRANSITION_EVENT_ID = generateIdentifier();

// POST organizations/:id/work-orders/:id/transition writes the transition
// state
// event and an OPTIONAL claim-release event in ONE transaction.
// Task 8 CUT: live gate rejects fieldValues; pure-move
// fixtures use the instance pure-move shape. Legacy
// fieldValues appends/validation pin the below-facade tier
// (stored-data truth; seed dual-tolerant). Spec W2 / plan
// Task 8.

const LOCK_TIMEOUT_SECONDS = 300;
const FLOW_ID = generateIdentifier();
const N_CREATE = generateIdentifier();
const TRANSITION_PATTERN = 'organizations/:id/work-orders/:id/transition';

function graphJson(): Record<string, unknown> {
    return {
        name: 'Flow One',
        lockTimeout: LOCK_TIMEOUT_SECONDS,
        nodes: [],
        edges: [],
    };
}

// Seed through the live create so the WO carries its pairs
// (row half stripped; claim/transition gates read the
// message plane).
async function seededDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedCreatedWorkOrder(db, {
        organization: STARK_ORGANIZATION,
        id: 'yNSSnbrpacodQTzUEcdEVA',
        fields: {
            display_id: 'abcd',
            flow_graph: graphJson(),
            position: 1,
        },
        flowId: FLOW_ID,
        births: [N_CREATE, N_CREATE],
        at: nowUtc(),
        token: DEV_TOKEN,
        claim: 'released',
    });
    return db;
}

// An operation on a work order names the head it read.
async function latched(
    db: MemoryDbAdapter,
): Promise<readonly (readonly [string, string])[]> {
    const read = await GET(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'yNSSnbrpacodQTzUEcdEVA',
        DEV_TOKEN, operationIdHeader(),
    );
    return operationIdHeader([
        ['If-Match', read.query('header.etag').toText()],
    ]);
}

// The three births and the creator's release come with the
// seeded work order; the events are what lands after.
const SEEDED_EVENTS = 4;

async function eventsFor(
    db: MemoryDbAdapter,
): Promise<{ state: string; member_id: string; at: string }[]> {
    const all = await getWorkOrderEvents(
        db, DEV_TOKEN, 'AjdvjuECVZEgZoFajaIEkg',
        'yNSSnbrpacodQTzUEcdEVA',
    );
    assertEquals(
        all.slice(0, SEEDED_EVENTS).map((event) => event.state),
        [N_CREATE, N_CREATE, 'claimed', 'claim_released'],
    );
    return all.slice(SEEDED_EVENTS);
}

// Below-facade legacy append (organization === undefined).
// Task 8: live gate rejects fieldValues; SFV/legacy fold
// pins stay on the seed-tier dual-tolerant path.
async function appendLegacyTransition(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<void> {
    const pathSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', 'yNSSnbrpacodQTzUEcdEVA', 'transition',
    ];
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TRANSITION_PATTERN,
        routeSegments: TRANSITION_PATTERN.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: STARK_ORGANIZATION,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await postSeedWorkOrderTransitionOp(
        db, STARK_ORGANIZATION, 'yNSSnbrpacodQTzUEcdEVA', body,
        SYSTEM_MEMBER_ID, messagePair,
    );
}

Deno.test(
    'a transition writes the target state event authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
            await latched(db));
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.state, 'n-next');
        assertStrictEquals(events[0]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

// Spec W2 / Task 8: value-bearing legacy fold is stored-
// data truth — append below the gate, not the live wire.
Deno.test(
    'a transition folds field values onto the message plane'
    + ' alongside the transition event',
    async () => {
        const db = await seededDb();
        // The field row references a record attribute; seed one
        // so the foreign target exists for the read paths.
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', {
                name: 'WO Parent', description: '',
                position: 0,
                state: 'active',
            },
            DEV_TOKEN,
            operationIdHeader());
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
                read_roles: ['member', 'admin'],
                write_roles: ['member', 'admin'],
            },
            DEV_TOKEN,
            operationIdHeader());
        await appendLegacyTransition(db, {
            transitionEventId: TRANSITION_EVENT_ID,
            targetState: 'n-next',
            fieldValues: [
                {
                    id: FIELD_VALUE_ID,
                    fields: {
                        state_event_id: TRANSITION_EVENT_ID,
                        attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                        value: 'high',
                    },
                },
            ],
            release: null,
            transitionAt: nowUtc(),
        });
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.state, 'n-next');
        // Phase Final Task 2: SFV row plane empty; message-plane
        // transition fold rides the work order's versions.
        // Phase Final Stage B: state_field_values retired.
        const history = await getWorkOrderEvents(
            db, DEV_TOKEN, STARK_ORGANIZATION,
            'yNSSnbrpacodQTzUEcdEVA',
        );
        const transition = history.find(
            (row) => row.id === TRANSITION_EVENT_ID,
        );
        assert(transition !== undefined);
        assertEquals(transition!.field_values, [{
            id: FIELD_VALUE_ID,
            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
            value: 'high',
        }]);
    },
);

Deno.test(
    'the optional claim release fires when carried, authored'
    + ' by the actor',
    async () => {
        const db = await seededDb();
        // A live claim exists; the web-app decided to release
        // it and carried the release event in the body.
        // Claim rides the named op (states/:id retired).
        const claimAt = nowUtc();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: CLAIM_EVENT_ID,
                claimAt,
                expireEventId: EXPIRE_EVENT_ID,
                expireAt: claimAt,
            },
            DEV_TOKEN,
            await latched(db));
        // Mint transitionAt before release.at so the
        // at-ordered log matches route post order.
        const transitionAt = nowUtc();
        const releaseAt = nowUtc();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: {
                    id: RELEASE_EVENT_ID,
                    state: 'claim_released',
                    at: releaseAt,
                },
                transitionAt,
            },
            DEV_TOKEN,
            await latched(db));
        const events = await eventsFor(db);
        assertEquals(
            events.map(ev => ev.state),
            ['claimed', 'n-next', 'claim_released'],
        );
        assertStrictEquals(events[1]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
        assertStrictEquals(events[2]!.state, 'claim_released');
        assertStrictEquals(events[2]!.member_id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'no claim release fires when release is null',
    async () => {
        const db = await seededDb();
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: nowUtc(),
            },
            DEV_TOKEN,
            await latched(db));
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(
            events.some(ev => ev.state === 'claim_released'),
            false,
        );
    },
);

// Task 8: legacy fold validation remains on the below-
// facade tier (gate rejects the fieldValues key first).
Deno.test(
    'a field value missing attribute_id is a 400 and'
    + ' leaves zero events (gate re-homes store validation)',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: validateStateFieldValueEntity
        // runs in the dual-tolerant validator (no SFV put).
        // A malformed fold 400s pre-tx — zero events.
        await assertRejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            state_event_id: 'te1',
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                    {
                        id: generateIdentifier(),
                        fields: {
                            state_event_id: 'te1',
                            value: 'low',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            ValidationError,
        );
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 0);
        // Failed gate left no ghost event: the history holds
        // the seeded work order's own events, none under the
        // rejected transition's id.
        const history = await getWorkOrderEvents(
            db, DEV_TOKEN, STARK_ORGANIZATION,
            'yNSSnbrpacodQTzUEcdEVA',
        );
        assertStrictEquals(
            history.find((row) => row.id === 'te1'), undefined,
        );
    },
);

Deno.test(
    'a transition body with an unexpected key is a 400',
    async () => {
        const db = await seededDb();
        const tags = await latched(db);
        const err = await assertRejects(
            () => POST(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                    + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                    transitionEventId: 'te1',
                    targetState: 'n-next',
                    release: null,
                    transitionAt: nowUtc(),
                    surprise: true,
                },
                DEV_TOKEN,
                tags),
        ) as RequestError;
        assertInstanceOf(err, RequestError);
        assertStrictEquals(err.status, 400);
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 0);
    },
);

// Wire delta (4) — Phase 15 Task 3: a field value whose
// state_event_id is not THIS transition's own
// transitionEventId is rejected. Task 8: pin stays on the
// below-facade dual-tolerant validator (live gate retires
// the key first).
Deno.test(
    'a field value with a dangling state_event_id is a 400',
    async () => {
        const db = await seededDb();
        // Phase Final Stage B: record_attributes retired.
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw', {
                name: 'WO Parent', description: '',
                position: 0,
                state: 'active',
            },
            DEV_TOKEN,
            operationIdHeader());
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                + 'rbfHGatkwQzGZJVXKJEeyw'
            + '/attributes/VPckAwjJsTGCEkKaOOGRGw', {
                name: 'Severity',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
                read_roles: ['member', 'admin'],
                write_roles: ['member', 'admin'],
            },
            DEV_TOKEN,
            operationIdHeader());
        await assertRejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            state_event_id: 'other-event',
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            ValidationError,
            'state_event_id must equal transitionEventId',
        );
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 0);
        // Phase Final Stage B: state_field_values retired.
    },
);

Deno.test(
    'a field value with an absent state_event_id is a 400',
    async () => {
        const db = await seededDb();
        await assertRejects(
            () => appendLegacyTransition(db, {
                transitionEventId: 'te1',
                targetState: 'n-next',
                fieldValues: [
                    {
                        id: FIELD_VALUE_ID,
                        fields: {
                            attribute_id: 'VPckAwjJsTGCEkKaOOGRGw',
                            value: 'high',
                        },
                    },
                ],
                release: null,
                transitionAt: nowUtc(),
            }),
            ValidationError,
            'state_event_id must equal transitionEventId',
        );
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 0);
    },
);

Deno.test(
    'transitionAt is recorded as the transition event at',
    async () => {
        const db = await seededDb();
        // Far-future value to distinguish caller-minted
        // from a server-generated nowUtc().
        const callerAt = '2099-01-01T00:00:00.000000Z';
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: null,
                transitionAt: callerAt,
            },
            DEV_TOKEN,
            await latched(db));
        const events = await eventsFor(db);
        assertStrictEquals(events.length, 1);
        assertStrictEquals(events[0]!.state, 'n-next');
        assertStrictEquals(events[0]!.at, callerAt);
    },
);

Deno.test(
    'release.at is recorded as the release event at',
    async () => {
        const db = await seededDb();
        // Claim rides the named op (states/:id retired).
        const claimAt = nowUtc();
        await PUT(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/claim', {
                claimEventId: CLAIM_EVENT_ID,
                claimAt,
                expireEventId: EXPIRE_EVENT_ID,
                expireAt: claimAt,
            },
            DEV_TOKEN,
            await latched(db));
        // Far-future values to distinguish caller-minted
        // from a server-generated nowUtc().
        const transitionAt = '2099-01-01T00:00:00.000000Z';
        const releaseAt = '2099-01-01T00:00:01.000000Z';
        await POST(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
                + 'yNSSnbrpacodQTzUEcdEVA/transition', {
                transitionEventId: 'te1',
                targetState: 'n-next',
                release: {
                    id: RELEASE_EVENT_ID,
                    state: 'claim_released',
                    at: releaseAt,
                },
                transitionAt,
            },
            DEV_TOKEN,
            await latched(db));
        const events = await eventsFor(db);
        // events: claimed, n-next, claim_released
        assertStrictEquals(events[1]!.state, 'n-next');
        assertStrictEquals(events[1]!.at, transitionAt);
        assertStrictEquals(events[2]!.state, 'claim_released');
        assertStrictEquals(events[2]!.at, releaseAt);
    },
);
