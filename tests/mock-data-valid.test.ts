import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { DEFAULT_ORG } from '../api/types.ts';
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

// organizations is now an entity store (the tenant root).

test('mock-data seeds the organizations table', async () => {
    const db = await seededDb();
    const org = await db.organizations.getById(DEFAULT_ORG);
    assert.ok(org.id.length > 0);
});

test('mock-data organization row passes the validator', async () => {
    const db = await seededDb();
    const org = await db.organizations.getById(DEFAULT_ORG);
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
