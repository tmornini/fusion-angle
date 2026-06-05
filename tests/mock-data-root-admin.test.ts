import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    populateBootstrapData,
    populateMockData,
} from '../api/mock-data.ts';
import {
    currentRolesForInOrg,
} from '../api/authorization.ts';
import { DEFAULT_ORG } from '../api/types.ts';

test('bootstrap seeds current as admin', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateBootstrapData(db);
    const rows = await db.roleGrants.getAll();
    assert.ok(
        currentRolesForInOrg(rows, 'current', DEFAULT_ORG)
            .includes('admin'));
});

test('mock data seeds current as admin', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateMockData(db);
    const rows = await db.roleGrants.getAll();
    assert.ok(
        currentRolesForInOrg(rows, 'current', DEFAULT_ORG)
            .includes('admin'));
});
