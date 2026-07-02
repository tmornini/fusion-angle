import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    postBootstrap,
    postMockDataLoad,
} from '../api/mock-data.ts';
import {
    currentRolesForInOrganization,
} from '../api/authorization.ts';

test('bootstrap seeds current as admin', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const rows = await db.roleGrants.getAll();
    assert.ok(
        currentRolesForInOrganization(rows, 'current', '1')
            .includes('admin'));
});

test('mock data seeds current as admin', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    const rows = await db.roleGrants.getAll();
    assert.ok(
        currentRolesForInOrganization(rows, 'current', '1')
            .includes('admin'));
});
