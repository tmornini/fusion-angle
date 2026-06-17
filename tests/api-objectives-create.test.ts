import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The objective body OMITS organization_id — the org fence
// stamps it from the verified token before the store validates.
function objectiveFields() {
    return { position: 1 };
}

// A first-revision body. member_id is a row column (who authored
// the definition), supplied in the body — objective creation
// writes NO state event, so there is no authored event here.
function revisionFields(id: string, name: string) {
    return {
        objective_id: id,
        name,
        description: 'd',
        member_id: 'current',
        at: '2026-05-14T00:00:00.000000Z',
    };
}

test(
    'POST objectives writes the objective row and its'
    + ' first revision in one operation',
    async () => {
        const db = await freshDb();
        await POST(db, 'objectives', {
            id: 'obj-1',
            objective: objectiveFields(),
            revisionId: 'rev-1',
            revision: revisionFields('obj-1', 'Revenue'),
        }, DEV_TOKEN);
        const objective = await GET<{
            id: string;
            position: number;
            organization_id: string;
        }>(db, 'objectives/obj-1', DEV_TOKEN);
        assert.equal(objective.position, 1);
        // The fence stamped the bound org — never the body.
        assert.equal(objective.organization_id, '1');
        // The leaf revision route is PUT-only; read the nested
        // per-objective collection and find the row the create
        // wrote (the server filters it to obj-1).
        const revisions = await GET<Array<{
            id: string;
            objective_id: string;
            name: string;
        }>>(db, 'objectives/obj-1/revisions', DEV_TOKEN);
        const revision = revisions.find(r => r.id === 'rev-1');
        assert.ok(revision);
        assert.equal(revision.objective_id, 'obj-1');
        assert.equal(revision.name, 'Revenue');
    },
);

test(
    'POST objectives rolls back the objective row when'
    + ' its first revision is malformed',
    async () => {
        const db = await freshDb();
        // An empty revision name is rejected by the
        // objective_revisions store validator mid-tx (after the
        // objective row is put), so the objective write must
        // roll back with it.
        await assert.rejects(
            () => POST(db, 'objectives', {
                id: 'obj-rollback',
                objective: objectiveFields(),
                revisionId: 'rev-rollback',
                revision: revisionFields('obj-rollback', ''),
            }, DEV_TOKEN),
        );
        await assert.rejects(
            () => GET(
                db, 'objectives/obj-rollback', DEV_TOKEN,
            ),
        );
    },
);
