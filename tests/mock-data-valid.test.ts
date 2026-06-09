import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
import {
    validateMemberEntity,
    validateHumanMemberEntity,
    validateAIMemberEntity,
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
    validateStoredGraphJson,
} from '../api/validators.ts';

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
    await db.createSchema();
    await populateMockData(db);
    return db;
}

// Each entry: table name, getAll fn, validator.
const TABLES: ReadonlyArray<[
    string,
    (db: MemoryDbAdapter) => Promise<{ id: string }[]>,
    Validator,
]> = [
    ['members', d => d.members.getAll(),
        validateMemberEntity],
    ['humanMembers', d => d.humanMembers.getAll(),
        validateHumanMemberEntity],
    ['aiMembers', d => d.aiMembers.getAll(),
        validateAIMemberEntity],
    ['ideas', d => d.ideas.getAll(),
        validateIdeaEntity],
    ['projects', d => d.projects.getAll(),
        validateProjectEntity],
    ['flows', d => d.flows.getAll(),
        validateFlowEntity],
    ['ideaSubmissions',
        d => d.ideaSubmissions.getAll(),
        validateIdeaSubmissionEntity],
    ['projectFlows', d => d.projectFlows.getAll(),
        validateProjectFlowEntity],
    ['workOrders', d => d.workOrders.getAll(),
        validateWorkOrderEntity],
    ['flowWorkOrders',
        d => d.flowWorkOrders.getAll(),
        validateFlowWorkOrderEntity],
    ['states',
        d => d.states.getAll(),
        validateStateEntity],
    ['stateFieldValues',
        d => d.stateFieldValues.getAll(),
        validateStateFieldValueEntity],
];

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

// The Office of Time: every persisted `at` is 6-digit
// microsecond zulu (SCHEMA.md). The append-only `states` log is
// seeded AND appended at runtime, so a seed that mints a
// different width than nowUtc() makes "latest by `at`" sort
// wrong under lexical compare. Pin the score ledgers — they
// feed the dashboard Objective sparkline tooltips — and the
// states log to the canonical width.
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const AT_LEDGERS: ReadonlyArray<[
    string,
    (db: MemoryDbAdapter) => Promise<{ id: string; at: string }[]>,
]> = [
    ['projectObjectiveBaselineScores',
        d => d.projectObjectiveBaselineScores.getAll()],
    ['projectObjectiveActualScores',
        d => d.projectObjectiveActualScores.getAll()],
    ['states', d => d.states.getAll()],
];

for (const [name, getAll] of AT_LEDGERS) {
    test(
        `mock-data ${name}.at is 6-digit zulu`,
        async () => {
            const db = await seededDb();
            const rows = await getAll(db);
            assert.ok(rows.length > 0, `${name} empty`);
            for (const row of rows) {
                assert.match(
                    row.at, ZULU_6,
                    `row ${row.id} in ${name}`,
                );
            }
        },
    );
}

// organizations is now an entity store (the tenant root).

test('mock-data seeds the organizations table', async () => {
    const db = await seededDb();
    const org = await db.organizations.getById('1');
    assert.ok(org.id.length > 0);
});

test('mock-data organization row passes the validator', async () => {
    const db = await seededDb();
    const org = await db.organizations.getById('1');
    assert.doesNotThrow(
        () => validateOrganizationEntity(withoutId(org)),
    );
});

// validateFlowEntity only checks that flow.graph is a
// JsonObjectField (an opaque branded string). The strict
// per-node / per-edge shape lives behind asStoredGraph;
// without this test, a seed that omits e.g. node.description
// would pass entity-row validation and surface as a runtime
// validator throw on the first read path. Pin the deep
// content here.

test(
    'mock-data flow.graph JSON validates via asStoredGraph',
    async () => {
        const db = await seededDb();
        const flows = await db.flows.getAll();
        assert.ok(
            flows.length > 0,
            'precondition: flows seeded',
        );
        for (const flow of flows) {
            assert.doesNotThrow(
                () => validateStoredGraphJson(
                    flow.graph,
                    'flows[' + flow.id + '].graph',
                ),
                'flow ' + flow.id
                    + ' should parse via asStoredGraph',
            );
        }
    },
);

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
        const [
            workOrders, states, memberships, members,
        ] = await Promise.all([
            db.workOrders.getAll(),
            db.states.getAll(),
            db.memberships.getAll(),
            db.members.getAll(),
        ]);
        const orgByWo = new Map(
            workOrders.map(w => [w.id, w.organization_id]),
        );
        const orgsByMember = new Map<string, Set<string>>();
        for (const m of memberships) {
            const set = orgsByMember.get(m.identity_id)
                ?? new Set<string>();
            set.add(m.organization_id);
            orgsByMember.set(m.identity_id, set);
        }
        const systemMembers = new Set(
            members
                .filter(m => m.type === 'system')
                .map(m => m.id),
        );
        const violations = new Set<string>();
        for (const s of states) {
            const woOrg = orgByWo.get(s.entity_id);
            if (woOrg === undefined) continue;
            if (systemMembers.has(s.member_id)) continue;
            const orgs = orgsByMember.get(s.member_id);
            if (orgs === undefined || !orgs.has(woOrg)) {
                violations.add(
                    s.member_id + ' in org ' + woOrg,
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
