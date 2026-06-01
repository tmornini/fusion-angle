import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { populateBootstrapData } from '../api/mock-data.ts';
import { SYSTEM_WORKER_ID } from '../api/types.ts';

// A pristine environment seeds only the infrastructure the
// app requires to render its shell — the system actor (event
// author), the current user, and the singleton organization.
// Sample Records are browsable demo content, not required, so
// pristine leaves the Records tables empty.

async function bootstrappedDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await populateBootstrapData(db);
    return db;
}

test('pristine bootstrap seeds no Records', async () => {
    const db = await bootstrappedDb();
    const records = await db.records.getAll();
    const attributes = await db.recordAttributes.getAll();
    assert.equal(records.length, 0);
    assert.equal(attributes.length, 0);
});

test(
    'pristine bootstrap seeds required infrastructure',
    async () => {
        const db = await bootstrappedDb();
        const ids = (await db.workers.getAll())
            .map(w => w.id);
        assert.ok(
            ids.includes(SYSTEM_WORKER_ID),
            'system worker seeded',
        );
        assert.ok(
            ids.includes('current'),
            'current user seeded',
        );
        const org = await db.organization.get();
        assert.ok(
            org.id.length > 0,
            'organization seeded',
        );
    },
);
