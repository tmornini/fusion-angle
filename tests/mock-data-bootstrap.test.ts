import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { postBootstrap } from '../api/mock-data.ts';
import {
    SYSTEM_MEMBER_ID,
} from '../api/types.ts';
import { deriveOrganization } from
    '../api/derive-organizations.ts';

// A pristine environment seeds only the infrastructure the
// app requires to render its shell — the system actor (event
// author), the current user, and the singleton organization.
// Sample Records are browsable demo content, not required, so
// pristine leaves the Records tables empty.

async function bootstrappedDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await postBootstrap(db);
    return db;
}

test('pristine bootstrap seeds no Records', async () => {
    const db = await bootstrappedDb();
    // Pair plane: no records-family document pairs. Sample
    // Records are demo content from postMockDataLoad, not
    // bootstrap. Covers records, record-attributes, and
    // flow_records joins (…/flows/:id/records/).
    const requests = await db.requests.getAll();
    const recordFamily = requests.filter((r) =>
        r.uri_prefix.includes('/records/')
        || r.uri_prefix.includes('/record-attributes/')
    );
    assert.equal(
        recordFamily.length, 0,
        'bootstrap seeds no records-family pairs',
    );
});

test(
    'pristine bootstrap seeds required infrastructure',
    async () => {
        const db = await bootstrappedDb();
        // Phase Final Task 2: members ROW half stripped —
        // parent documents from the pair plane.
        const { deriveMemberParents } = await import(
            '../api/derive-members.ts'
        );
        const ids = (await deriveMemberParents(db))
            .map(w => w.id);
        assert.ok(
            ids.includes(SYSTEM_MEMBER_ID),
            'system member seeded',
        );
        assert.ok(
            ids.includes('current'),
            'current user seeded',
        );
        // Phase Final Stage B: roster tables retired.
        // Phase Final Task 2: organizations ROW half stripped.
        const organization = await deriveOrganization(db, '1');
        assert.ok(
            organization.id.length > 0,
            'organization seeded',
        );
        // Phase Final Stage B: organizations table retired.
    },
);
