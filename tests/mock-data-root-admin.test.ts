import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    postBootstrap,
    postMockDataLoad,
} from '../api/mock-data.ts';
import { deriveMembershipsForIdentity } from
    '../api/derive-memberships.ts';

// Privilege is membership type:"admin" — claim roles bake
// from that type at mint. No role-grants family.

test('bootstrap seeds current as admin', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    const rows = await deriveMembershipsForIdentity(
        db, 'current',
    );
    assert.ok(
        rows.some(
            m => m.organization_id === '1'
                && m.type === 'admin',
        ),
    );
});

test('mock data seeds current as admin', async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    const rows = await deriveMembershipsForIdentity(
        db, 'current',
    );
    assert.ok(
        rows.some(
            m => m.organization_id === '1'
                && m.type === 'admin',
        ),
    );
});
