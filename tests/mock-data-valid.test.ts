import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';
import { deriveMemberParents } from
    '../api/derive-members.ts';
import {
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateStateEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
} from '../api/validators.ts';
import {
    deriveIdea,
    deriveIdeas,
    deriveIdeaSubmissions,
} from '../api/derive-ideas.ts';
import {
    deriveProjects,
} from '../api/derive-projects.ts';
import { deriveProjectFlows } from
    '../api/derive-project-flows.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
} from '../api/derive-project-scores.ts';
import {
    deriveFlows,
} from '../api/derive-flows.ts';
import {
    deriveOrganization,
    deriveOrganizations,
} from '../api/derive-organizations.ts';
import {
    documentCollectionGetHandler,
    type DocumentFamilyWiring,
} from '../api/document-family.ts';
import {
    validateWorkOrderDocumentBody,
} from '../api/validators.ts';
import { postWorkOrderDocumentOp } from
    '../api/routes.ts';
import { deriveFlowWorkOrders } from
    '../api/derive-flow-work-orders.ts';
import {
    stateFieldValuesForStateEvent,
} from '../api/derive-state-field-values.ts';
import {
    deriveStates,
    deriveStatesFor,
} from '../api/derive-states.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import {
    assignOrganization,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { buildWorkOrders } from
    '../api/mock-data/work-orders.ts';
import {
    buildLeadToCloseWorkload,
} from '../api/mock-data/lead-to-close-flow.ts';
import { l2cFlowId } from
    '../api/mock-data/lead-to-close-flow.ts';
import type { WorkOrderEntity } from
    '../api/types.ts';

// Entity validators take Omit<T, 'id'> and reject an extra
// "id" key, so strip the id before validating each row.
function withoutId(
    row: { id: string },
): Record<string, unknown> {
    const { id: _omit, ...rest } = row;
    return rest;
}

type Validator = (b: Record<string, unknown>) => unknown;

async function seededDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    return db;
}

// Each entry: table name, getAll fn, validator.
// Phase Final Task 2: members/humanMembers/aiMembers seed
// row halves stripped — non-empty pins retired with the
// tables; pair-plane coverage lives in drift-roster.
const TABLES: ReadonlyArray<[
    string,
    (db: MemoryDbAdapter) => Promise<{ id: string }[]>,
    Validator,
]> = [
    // states re-homed below (Phase Final Task 2:
    // states ROW half stripped).
];

const WORK_ORDERS_WIRING: DocumentFamilyWiring = {
    family: 'work-orders',
    lifecycle: 'stateless',
    notFoundTable: 'work_orders',
    validateDocument: validateWorkOrderDocumentBody,
    documentOp: postWorkOrderDocumentOp,
    entityOf: (document, organization) => ({
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    }),
};


// Phase Final Task 2: states ROW half stripped — validate
// the derived plane (pair-plane truth).
test('mock-data seeds non-empty derived states',
async () => {
    const db = await seededDb();
    const rows = await deriveStates(db, '1');
    assert.ok(rows.length > 0, 'derived states empty');
    for (const row of rows) {
        assert.doesNotThrow(
            () => validateStateEntity(withoutId(row)),
            'state ' + row.id,
        );
    }
    // Phase Final Stage B: states table retired.
});

for (const [name, getAll, validate] of TABLES) {
    test(
        `mock-data seeds non-empty ${name}`,
        async () => {
            const db = await seededDb();
            const rows = await getAll(db);
            assert.ok(
                rows.length > 0,
                `${name} should not be empty`,
            );
        },
    );

    test(
        `mock-data ${name} rows pass the validator`,
        async () => {
            const db = await seededDb();
            const rows = await getAll(db);
            for (const row of rows) {
                assert.doesNotThrow(
                    () => validate(withoutId(row)),
                    `row ${row.id} in ${name}`,
                );
            }
        },
    );
}

// Phase Final Task 2: ideas(+idea_submissions) seed row halves
// stripped — validate the derived plane (pair-plane truth).
test('mock-data seeds non-empty derived ideas per org',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const ideas = await deriveIdeas(db, organization);
        assert.ok(
            ideas.length > 0,
            'ideas empty in org ' + organization,
        );
        for (const idea of ideas) {
            assert.doesNotThrow(
                () => validateIdeaEntity(withoutId(idea)),
                'idea ' + idea.id,
            );
        }
    }
});

test('mock-data derived idea submissions pass validator',
async () => {
    const db = await seededDb();
    const seeds = buildIdeas().map((idea, index) => ({
        id: idea.id,
        organization: assignOrganization(index),
    }));
    let total = 0;
    for (const { id, organization } of seeds) {
        const subs = await deriveIdeaSubmissions(
            db, organization, id,
        );
        total += subs.length;
        for (const sub of subs) {
            assert.doesNotThrow(
                () => validateIdeaSubmissionEntity(
                    withoutId(sub),
                ),
                'submission ' + sub.id,
            );
        }
        // Per-idea deriveIdea also validates single-get path.
        await deriveIdea(db, organization, id);
    }
    assert.ok(total > 0, 'no derived idea submissions');
});

// Phase Final Task 2: projects(+project_flows+scores) seed
// row halves stripped — validate the derived plane.
test('mock-data seeds non-empty derived projects per org',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const projects = await deriveProjects(
            db, organization,
        );
        assert.ok(
            projects.length > 0,
            'projects empty in org ' + organization,
        );
        for (const project of projects) {
            assert.doesNotThrow(
                () => validateProjectEntity(withoutId(project)),
                'project ' + project.id,
            );
        }
    }
});

test('mock-data derived project_flows pass validator',
async () => {
    const db = await seededDb();
    let total = 0;
    for (const organization of ['1', '2']) {
        const projects = await deriveProjects(
            db, organization,
        );
        for (const project of projects) {
            const joins = await deriveProjectFlows(
                db, organization, project.id,
            );
            total += joins.length;
            for (const join of joins) {
                assert.doesNotThrow(
                    () => validateProjectFlowEntity(
                        withoutId(join),
                    ),
                    'project_flow ' + join.id,
                );
            }
        }
    }
    assert.ok(total > 0, 'no derived project_flows');
});

test('mock-data derived baseline/actual scores pass'
+ ' validators', async () => {
    const db = await seededDb();
    let baselineTotal = 0;
    let actualTotal = 0;
    for (const organization of ['1', '2']) {
        const projects = await deriveProjects(
            db, organization,
        );
        for (const project of projects) {
            const baselines = await deriveBaselineScores(
                db, organization, project.id,
            );
            baselineTotal += baselines.length;
            for (const row of baselines) {
                assert.doesNotThrow(
                    () => validateBaselineScoreEntity(
                        withoutId(row),
                    ),
                    'baseline ' + row.id,
                );
            }
            const actuals = await deriveActualScores(
                db, organization, project.id,
            );
            actualTotal += actuals.length;
            for (const row of actuals) {
                assert.doesNotThrow(
                    () => validateActualScoreEntity(
                        withoutId(row),
                    ),
                    'actual ' + row.id,
                );
            }
        }
    }
    assert.equal(baselineTotal, 49);
    assert.equal(actualTotal, 92);
});

// The Office of Time: every persisted `at` is 6-digit
// microsecond zulu (SCHEMA.md). The append-only `states` log is
// seeded AND appended at runtime, so a seed that mints a
// different width than nowUtc() makes "latest by `at`" sort
// wrong under lexical compare. Scores re-homed to the derive
// plane (Phase Final Task 2).
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

// Phase Final Task 2: states ROW half stripped — pin
// derived-plane .at (pair plane is truth).
test('mock-data derived states.at is 6-digit zulu',
async () => {
    const db = await seededDb();
    const rows = await deriveStates(db, '1');
    assert.ok(rows.length > 0, 'derived states empty');
    for (const row of rows) {
        assert.match(
            row.at, ZULU_6,
            'row ' + row.id + ' in derived states',
        );
    }
    // Phase Final Stage B: states table retired.
});

test('mock-data derived score .at is 6-digit zulu',
async () => {
    const db = await seededDb();
    let checked = 0;
    for (const organization of ['1', '2']) {
        const projects = await deriveProjects(
            db, organization,
        );
        for (const project of projects) {
            for (const row of [
                ...await deriveBaselineScores(
                    db, organization, project.id,
                ),
                ...await deriveActualScores(
                    db, organization, project.id,
                ),
            ]) {
                assert.match(
                    row.at, ZULU_6,
                    'score ' + row.id,
                );
                checked += 1;
            }
        }
    }
    assert.ok(checked > 0, 'no derived scores');
});

// Phase Final Task 2: organizations ROW half stripped —
// validate the derived plane (pair-plane truth).

test('mock-data seeds non-empty derived organizations',
async () => {
    const db = await seededDb();
    const organizations = await deriveOrganizations(db);
    assert.ok(organizations.length >= 2);
    // Phase Final Stage B: organizations table retired.
});

test('mock-data derived organization passes the validator',
async () => {
    const db = await seededDb();
    const organization = await deriveOrganization(db, '1');
    assert.doesNotThrow(
        () => validateOrganizationEntity(
            withoutId(organization),
        ),
    );
});

// Phase Final Task 2: flows seed row half stripped — validate
// the derived plane (pair-plane truth). Graph shape is pinned
// by mock-data-flow-relations (pair graph equals authored).
test('mock-data seeds non-empty derived flows per org',
async () => {
    const db = await seededDb();
    for (const organization of ['1', '2']) {
        const flows = await deriveFlows(db, organization);
        assert.ok(
            flows.length > 0,
            'flows empty in org ' + organization,
        );
        for (const flow of flows) {
            // FlowWithGraph carries graph + hasUndoHistory —
            // strip those before validateFlowEntity.
            const {
                graph: _g, hasUndoHistory: _h, ...entity
            } = flow;
            assert.doesNotThrow(
                () => validateFlowEntity(withoutId(entity)),
                'flow ' + flow.id,
            );
            assert.ok(
                typeof flow.graph === 'string'
                && flow.graph.length > 0,
                'flow ' + flow.id + ' missing graph',
            );
        }
    }
});

// Phase Final Task 2: work-orders + joins + SFV from the
// pair plane (row halves stripped).
test('mock-data seeds non-empty derived work orders',
async () => {
    const db = await seededDb();
    const derived = await documentCollectionGetHandler(
        WORK_ORDERS_WIRING,
    )(db, [], 'current', STARK_ORGANIZATION) as
        WorkOrderEntity[];
    assert.ok(derived.length > 0, 'work orders empty');
    for (const wo of derived) {
        assert.doesNotThrow(
            () => validateWorkOrderEntity(withoutId(wo)),
            'work order ' + wo.id,
        );
    }
});

test('mock-data derived flow-work-order joins pass validator',
async () => {
    const db = await seededDb();
    const flowIds = [
        'h5mErVBQhwdMKwi1co30jB',
        '7COt7Kf4OaOBg6AjaNO04s',
        l2cFlowId,
    ];
    let total = 0;
    for (const flowId of flowIds) {
        const joins = await deriveFlowWorkOrders(
            db, STARK_ORGANIZATION, flowId,
        );
        total += joins.length;
        for (const join of joins) {
            assert.doesNotThrow(
                () => validateFlowWorkOrderEntity(
                    withoutId(join),
                ),
                'join ' + join.id,
            );
        }
    }
    assert.ok(total > 0, 'no flow-work-order joins');
});

test('mock-data derived seed SFV pairs pass validator',
async () => {
    const db = await seededDb();
    // Seven seed leaf pairs at states/:id/field-values/:fvid.
    // Discover via states that have field values by scanning
    // known seed work-order transition events is brittle —
    // instead pin non-empty union over every seeded WO's
    // state events via the two-source derive.
    const woIds = [
        ...buildWorkOrders().map(w => w.id),
        ...buildLeadToCloseWorkload().workOrders.map(w => w.id),
    ];
    // Phase Final Task 2: states ROW half stripped —
    // discover events via deriveStatesFor.
    const allEvents = (
        await Promise.all(
            woIds.map(id =>
                deriveStatesFor(db, STARK_ORGANIZATION, id),
            ),
        )
    ).flat();
    let total = 0;
    for (const ev of allEvents) {
        const fvs = await stateFieldValuesForStateEvent(
            db, STARK_ORGANIZATION, ev.id,
        );
        total += fvs.length;
        for (const fv of fvs) {
            assert.doesNotThrow(
                () => validateStateFieldValueEntity(
                    withoutId(fv),
                ),
                'sfv ' + fv.id,
            );
        }
    }
    assert.ok(total >= 7, 'expected >=7 SFV, got ' + total);
    // Phase Final Stage B: state_field_values table retired.
});

// The Workbox inbox resolves every work-order transition's
// author through the org-scoped member map (memberName).
// A transition stamped by a member who is not in the work
// order's org is therefore an impossible state — it crashes
// the inbox rather than degrading. Pin the invariant here so
// a cross-org author in the seed (e.g. a Wayne member on a
// Stark flow node) fails the suite instead of production.

test(
    'every work-order transition author belongs to'
    + ' the work order\'s org',
    async () => {
        const db = await seededDb();
        // Phase Final Task 2: WO org from pair plane.
        const workOrders = await documentCollectionGetHandler(
            WORK_ORDERS_WIRING,
        )(db, [], 'current', STARK_ORGANIZATION) as
            WorkOrderEntity[];
        // Phase Final Stage B: states table retired —
        // lifecycle events from the pair plane.
        const states = [
            ...await deriveStates(db, '1'),
            ...await deriveStates(db, '2'),
        ];
        // Phase Final Task 2: memberships + members from
        // the pair plane.
        const organizationByWo = new Map(
            workOrders.map(w => [w.id, w.organization_id]),
        );
        const authorIds = new Set(
            states
                .filter(s => organizationByWo.has(s.entity_id))
                .map(s => s.member_id),
        );
        const organizationsByMember =
            new Map<string, Set<string>>();
        for (const identityId of authorIds) {
            const rows = await deriveMembershipsForIdentity(
                db, identityId,
            );
            organizationsByMember.set(
                identityId,
                new Set(rows.map(m => m.organization_id)),
            );
        }
        const parents = await deriveMemberParents(db);
        const systemMembers = new Set(
            parents
                .filter(m => m.type === 'system')
                .map(m => m.id),
        );
        const violations = new Set<string>();
        for (const s of states) {
            const woOrganization =
                organizationByWo.get(s.entity_id);
            if (woOrganization === undefined) continue;
            if (systemMembers.has(s.member_id)) continue;
            const organizations =
                organizationsByMember.get(s.member_id);
            if (
                organizations === undefined
                || !organizations.has(woOrganization)
            ) {
                violations.add(
                    s.member_id + ' in org ' + woOrganization,
                );
            }
        }
        assert.deepEqual(
            [...violations],
            [],
            'cross-org work-order transition authors: '
            + [...violations].join('; '),
        );
    },
);
