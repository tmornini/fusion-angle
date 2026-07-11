import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    postBootstrap,
    postMockDataLoad,
} from '../api/mock-data.ts';
import {
    currentRolesForInOrganization,
} from '../api/authorization.ts';
import { deriveRoleGrants } from
    '../api/derive-identity-spine.ts';

// Phase Final Task 2: role_grants ROW half stripped — oracle
// is the pair plane.

test('bootstrap seeds current as admin', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const rows = await deriveRoleGrants(db);
    assert.ok(
        currentRolesForInOrganization(rows, 'current', '1')
            .includes('admin'));
    // Phase Final Stage B: identity spine tables retired.
});

test('mock data seeds current as admin', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    const rows = await deriveRoleGrants(db);
    assert.ok(
        currentRolesForInOrganization(rows, 'current', '1')
            .includes('admin'));
    // Phase Final Stage B: identity spine tables retired.
});
