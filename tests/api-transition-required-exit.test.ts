import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { seedCurrentMember } from './member-fixtures.ts';
import {
    IF_MATCH_HEADER,
} from '../api/message-pair.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

// POST organizations/:id/work-orders/:id/transition — W10 required-at-exit
// gate (Task 9). Gate tier only: every transition leaving
// a node with isRequired refs validates the MERGED
// instance state; unbound at such a node → 400 naming
// the bind (A3). Ladder: after ACL 403 and constraint
// 400.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
const ORGANIZATION = '1';
const FLOW_ID = 'flow-req-exit-1';
const WO_ID = 'wo-req-exit-1';
const WO_FREE = 'wo-req-exit-free';
const TYPE_ID = 'rt-req-exit-1';
const ATTR_ID = 'attr-req-exit-1';
const ATTR_LOCKED = 'attr-req-exit-locked';
const ATTR_FOREIGN = 'attr-req-exit-foreign';
const INSTANCE_ID = 'inst-req-exit-1';
const FR_ID = 'fr-req-exit-1';
const FWO_ID = 'fwo-req-exit-1';
const FWO_FREE = 'fwo-req-exit-free';

const TYPE_DETAIL =
    '/organizations/' + ORGANIZATION
    + '/record-types/' + TYPE_ID;
const ATTRS = TYPE_DETAIL + '/attributes/';
const INSTANCES = TYPE_DETAIL + '/instances/';
const INSTANCE_DETAIL = INSTANCES + INSTANCE_ID;
const TRANSITION =
    '/organizations/1/work-orders/' + WO_ID + '/transition';
const TRANSITION_FREE =
    '/organizations/1/work-orders/' + WO_FREE + '/transition';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        headers: extraHeaders,
        operationId: TEST_OPERATION_ID,
    });
}

function nodeJson(
    id: string,
    opts: {
        isCreate?: boolean;
        isArchive?: boolean;
        required?: string[];
        optional?: string[];
    } = {},
): Record<string, unknown> {
    const attributes: Record<string, unknown>[] = [];
    for (const attributeId of opts.required ?? []) {
        attributes.push({
            attribute_id: attributeId,
            mode: 'editable',
            isRequired: true,
        });
    }
    for (const attributeId of opts.optional ?? []) {
        attributes.push({
            attribute_id: attributeId,
            mode: 'editable',
            isRequired: false,
        });
    }
    return {
        id,
        name: id,
        positionX: 0,
        positionY: 0,
        isCreate: opts.isCreate === true,
        isArchive: opts.isArchive === true,
        memberIds: [],
        attributes,
        taskInstructions: '',
    };
}

function edgeJson(
    id: string,
    from: string,
    to: string,
): Record<string, unknown> {
    return {
        id,
        name: 'go',
        fromNodeId: from,
        toNodeId: to,
    };
}

// Create → step (required Title) → target (free).
function requiredStepGraph(
    requiredAttrIds: string[] = [ATTR_ID],
): Record<string, unknown> {
    return {
        name: 'Req Exit Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            nodeJson('n-create', { isCreate: true }),
            nodeJson('n-step', {
                required: requiredAttrIds,
            }),
            nodeJson('n-target'),
        ],
        edges: [
            edgeJson('e-1', 'n-create', 'n-step'),
            edgeJson('e-2', 'n-step', 'n-target'),
        ],
    };
}

// Create → free (no required refs).
function freeGraph(): Record<string, unknown> {
    return {
        name: 'Free Exit Flow',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: [
            nodeJson('n-create', { isCreate: true }),
            nodeJson('n-free'),
        ],
        edges: [
            edgeJson('e-1', 'n-create', 'n-free'),
        ],
    };
}

function pureMoveBody(
    eventId: string,
    targetState: string,
): Record<string, unknown> {
    return {
        transitionEventId: eventId,
        targetState,
        release: null,
        transitionAt: nowUtc(),
    };
}

function valueBody(
    opts: {
        eventId?: string;
        targetState?: string;
        set?: {
            attribute_id: string;
            value: string;
        }[];
        clear?: string[];
        includeSet?: boolean;
        includeClear?: boolean;
    } = {},
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        transitionEventId: opts.eventId ?? 'te-val',
        targetState: opts.targetState ?? 'n-target',
        release: null,
        transitionAt: nowUtc(),
        instance_id: INSTANCE_ID,
        record_type_id: TYPE_ID,
    };
    const includeSet = opts.includeSet !== false
        || opts.set !== undefined;
    const includeClear = opts.includeClear === true
        || opts.clear !== undefined;
    if (includeSet) {
        body['set'] = opts.set ?? [
            {
                attribute_id: ATTR_ID,
                value: 'filled',
            },
        ];
    }
    if (includeClear) {
        body['clear'] = opts.clear ?? [];
    }
    return body;
}

async function seedMember1(
    db: MemoryDbAdapter,
): Promise<void> {
    const memBody = {
        organization_id: ORGANIZATION,
        identity_id: 'member1',
        type: 'member',
        at: AT,
    };
    await seedSeat(
        db,
        String(memBody['organization_id'] ?? memBody.organization_id),
        String(memBody['identity_id'] ?? memBody.identity_id),
        (memBody['type'] ?? memBody.type) as 'admin' | 'member',
        String(memBody['at'] ?? memBody.at),
    );

}

async function seedFlow(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/organizations/1/flows/', token, {
            id: FLOW_ID,
            flow: {
                name: 'Req Exit Flow',
                is_locked: false,
                is_auto_layout: false,
                is_auto_fit: false,
                lock_timeout: DEFAULT_LOCK_TIMEOUT,
            },
            projectFlowId: FLOW_ID + '-pf',
            projectFlow: {
                project_id: 'proj-req-exit-1',
                flow_id: FLOW_ID,
                at: AT,
            },
            initialState: 'active',
            initialStateEventId: FLOW_ID + '-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(res.status, 201);
}

async function seedWorkOrder(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    fwoId: string,
    flowGraph: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', '/organizations/1/work-orders/' + woId, token, {
            display_id: 'abcd',
            flow_graph: flowGraph,
            position: 1,
        },
    ));
    assert.equal(put.status, 201);
    const join = await handleRequest(db, req(
        'PUT',
        '/organizations/1/flows/' + FLOW_ID + '/work-orders/' + fwoId,
        token,
        {
            flow_id: FLOW_ID,
            work_order_id: woId,
            at: AT,
        },
    ));
    assert.equal(join.status, 201);
}

async function seedLiveType(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', TYPE_DETAIL, token, {
            name: 'Req Exit Type',
            description: '',
            position: 1,
            state: 'active',
        },
    ));
    assert.equal(put.status, 201);
}

async function seedAttribute(
    db: MemoryDbAdapter,
    token: string,
    attrId: string,
    body: Record<string, unknown>,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT', ATTRS + attrId, token, body,
    ));
    assert.equal(put.status, 201);
}

async function seedWritableText(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    await seedAttribute(db, token, ATTR_ID, {
        name: 'Title',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
        write_roles: [...DEFAULT_ATTRIBUTE_ACL_ROLES],
    });
}

async function seedInstance(
    db: MemoryDbAdapter,
    token: string,
    set: readonly {
        attribute_id: string;
        value: string;
    }[] = [],
): Promise<string> {
    const put = await handleRequest(db, req(
        'PATCH', INSTANCE_DETAIL, token,
        { set: [...set] },
    ));
    assert.equal(put.status, 201);
    return put.headers.get('ETag')!;
}

async function seedFlowTypeJoin(
    db: MemoryDbAdapter,
    token: string,
): Promise<void> {
    const put = await handleRequest(db, req(
        'PUT',
        '/organizations/1/flows/' + FLOW_ID + '/records/' + FR_ID,
        token,
        {
            id: FR_ID,
            flow_id: FLOW_ID,
            record_id: TYPE_ID,
            at: AT,
        },
    ));
    assert.equal(put.status, 201);
}

async function bindInstance(
    db: MemoryDbAdapter,
    token: string,
    woId: string = WO_ID,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT',
        '/organizations/1/work-orders/' + woId + '/binding',
        token,
        {
            instance_id: INSTANCE_ID,
            record_type_id: TYPE_ID,
        },
    ));
    assert.equal(res.status, 201);
}

// Place the WO on n-step by leaving n-create (no required).
async function placeOnStep(
    db: MemoryDbAdapter,
    token: string,
    woId: string,
    eventId: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST',
        '/organizations/1/work-orders/' + woId + '/transition',
        token,
        pureMoveBody(eventId, 'n-step'),
    ));
    assert.equal(res.status, 201);
}

async function baseSeed(): Promise<{
    db: MemoryDbAdapter;
    adminToken: string;
    memberToken: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedCurrentMember(db);
    await seedMember1(db);
    const adminToken = await organizationToken(
        'current', ORGANIZATION,
    );
    const memberToken = await organizationToken(
        'member1', ORGANIZATION,
    );
    await seedFlow(db, adminToken);
    await seedLiveType(db, adminToken);
    await seedWritableText(db, adminToken);
    await seedFlowTypeJoin(db, adminToken);
    return { db, adminToken, memberToken };
}

// --- A3 / W10 pins ---

test(
    '1 pure move UNBOUND at required node → 400 bind',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-1',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            pureMoveBody('te-unbound', 'n-target'),
        ));
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), {
            error:
                'work order has no instance binding',
        });
    },
);

test(
    '2 pure move bound + head satisfies → 204',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        await seedInstance(db, adminToken, [
            { attribute_id: ATTR_ID, value: 'ok' },
        ]);
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-2',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            pureMoveBody('te-ok', 'n-target'),
        ));
        assert.equal(res.status, 201);
    },
);

test(
    '3 pure move bound + head missing ref → 400 attr',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        // Empty instance head — required Title absent.
        await seedInstance(db, adminToken, []);
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-3',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            pureMoveBody('te-miss', 'n-target'),
        ));
        assert.equal(res.status, 400);
        const err = await res.json() as {
            error: string;
        };
        assert.match(
            err.error,
            /required attribute\(s\) missing at exit/,
        );
        assert.match(err.error, /Title/);
    },
);

test(
    '4 value-bearing fills ref in THIS delta → 204',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        const etag = await seedInstance(
            db, adminToken, [],
        );
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-4',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({
                eventId: 'te-fill',
                set: [
                    {
                        attribute_id: ATTR_ID,
                        value: 'now filled',
                    },
                ],
            }),
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(res.status, 201);
    },
);

test(
    '5 value-bearing CLEARING the ref → 400',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        const etag = await seedInstance(
            db, adminToken, [
                {
                    attribute_id: ATTR_ID,
                    value: 'present',
                },
            ],
        );
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-5',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            valueBody({
                eventId: 'te-clear',
                set: [],
                clear: [ATTR_ID],
                includeSet: true,
                includeClear: true,
            }),
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(res.status, 400);
        const err = await res.json() as {
            error: string;
        };
        assert.match(
            err.error,
            /required attribute\(s\) missing at exit/,
        );
        assert.match(err.error, /Title/);
    },
);

test(
    '6 no required refs: unbound pure move → 204',
    async () => {
        const { db, adminToken } = await baseSeed();
        await seedWorkOrder(
            db, adminToken, WO_FREE, FWO_FREE,
            freeGraph(),
        );
        // At n-create (no required). Unbound pure move.
        const res = await handleRequest(db, req(
            'POST', TRANSITION_FREE, adminToken,
            pureMoveBody('te-free', 'n-free'),
        ));
        assert.equal(res.status, 201);
    },
);

test(
    '7 ladder: ACL 403 before required-exit 400',
    async () => {
        const {
            db, adminToken, memberToken,
        } = await baseSeed();
        await seedAttribute(
            db, adminToken, ATTR_LOCKED, {
                name: 'Ops Only',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [],
                read_roles: [
                    ...DEFAULT_ATTRIBUTE_ACL_ROLES,
                ],
                write_roles: ['ops'],
            },
        );
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph(),
        );
        // Head missing required Title; body also tries
        // a role-locked set → must answer 403 (ACL),
        // not 400 (required).
        const etag = await seedInstance(
            db, adminToken, [],
        );
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-7',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, memberToken,
            valueBody({
                eventId: 'te-ladder',
                set: [
                    {
                        attribute_id: ATTR_LOCKED,
                        value: 'secret',
                    },
                ],
            }),
            { [IF_MATCH_HEADER]: etag },
        ));
        assert.equal(res.status, 403);
        assert.deepEqual(await res.json(), {
            error:
                'forbidden: attribute '
                + ATTR_LOCKED
                + ' is not writable with the held'
                + ' roles',
        });
    },
);

test(
    '8 graph ref outside bound type → 400 residual',
    async () => {
        const { db, adminToken } = await baseSeed();
        // Required ref names an attribute that is NOT
        // on the bound type — permanently unsatisfiable.
        await seedWorkOrder(
            db, adminToken, WO_ID, FWO_ID,
            requiredStepGraph([ATTR_FOREIGN]),
        );
        await seedInstance(db, adminToken, [
            { attribute_id: ATTR_ID, value: 'ok' },
        ]);
        await bindInstance(db, adminToken);
        await placeOnStep(
            db, adminToken, WO_ID, 'te-place-8',
        );
        const res = await handleRequest(db, req(
            'POST', TRANSITION, adminToken,
            pureMoveBody('te-foreign', 'n-target'),
        ));
        assert.equal(res.status, 400);
        const err = await res.json() as {
            error: string;
        };
        assert.match(
            err.error,
            /required attribute\(s\) missing at exit/,
        );
        assert.match(err.error, new RegExp(ATTR_FOREIGN));
    },
);
