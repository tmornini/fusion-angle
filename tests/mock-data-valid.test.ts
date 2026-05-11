import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateMockData } from '../api/mock-data.ts';
import {
    validatePersonEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateWorkOrderTransitionEntity,
    validateTransitionFieldValueEntity,
    validateRoleEntity,
    validateRoleMembershipEntity,
    validateCrewEntity,
    validateCrewRoleMembershipEntity,
    validateModelEntity,
    validateRoleModelMembershipEntity,
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
    await populateMockData(db);
    return db;
}

// Each entry: table name, getAll fn, validator.
const TABLES: ReadonlyArray<[
    string,
    (db: MemoryDbAdapter) => Promise<{ id: string }[]>,
    Validator,
]> = [
    ['people', d => d.people.getAll(),
        validatePersonEntity],
    ['ideas', d => d.ideas.getAll(),
        validateIdeaEntity],
    ['projects', d => d.projects.getAll(),
        validateProjectEntity],
    ['activities', d => d.activities.getAll(),
        validateActivityEntity],
    ['flows', d => d.flows.getAll(),
        validateFlowEntity],
    ['ideaSubmissions',
        d => d.ideaSubmissions.getAll(),
        validateIdeaSubmissionEntity],
    ['activityActors',
        d => d.activityActors.getAll(),
        validateActivityActorEntity],
    ['projectFlows', d => d.projectFlows.getAll(),
        validateProjectFlowEntity],
    ['workOrders', d => d.workOrders.getAll(),
        validateWorkOrderEntity],
    ['flowWorkOrders',
        d => d.flowWorkOrders.getAll(),
        validateFlowWorkOrderEntity],
    ['workOrderTransitions',
        d => d.workOrderTransitions.getAll(),
        validateWorkOrderTransitionEntity],
    ['transitionFieldValues',
        d => d.transitionFieldValues.getAll(),
        validateTransitionFieldValueEntity],
    ['roles', d => d.roles.getAll(),
        validateRoleEntity],
    ['roleMemberships',
        d => d.roleMemberships.getAll(),
        validateRoleMembershipEntity],
    ['crews', d => d.crews.getAll(),
        validateCrewEntity],
    ['crewRoleMemberships',
        d => d.crewRoleMemberships.getAll(),
        validateCrewRoleMembershipEntity],
    ['models', d => d.models.getAll(),
        validateModelEntity],
    ['roleModelMemberships',
        d => d.roleModelMemberships.getAll(),
        validateRoleModelMembershipEntity],
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

// organization is a singleton store, not an entity store.

test('mock-data seeds the organization singleton', async () => {
    const db = await seededDb();
    const org = await db.organization.get();
    assert.ok(org.id.length > 0);
});

test('mock-data organization row passes the validator', async () => {
    const db = await seededDb();
    const org = await db.organization.get();
    assert.doesNotThrow(
        () => validateOrganizationEntity(withoutId(org)),
    );
});
