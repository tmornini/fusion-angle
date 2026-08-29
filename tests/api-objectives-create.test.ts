import { test } from 'node:test';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { strict as assert } from 'node:assert';
import { GET, POST } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// The objective body OMITS organization_id — the org fence
// stamps it from the verified token before the store validates.
function objectiveFields() {
    return { position: 1 };
}

// A first-revision body. member_id is a row column (who authored
// the definition), supplied in the body. Genesis is a separate
// lifecycle trio on the create body (states-address retirement).
function revisionFields(id: string, name: string) {
    return {
        objective_id: id,
        name,
        description: 'd',
        member_id: 'XXZruirZyAOoRpNxaDnpSA',
        at: '2026-05-14T00:00:00.000000Z',
    };
}

function genesisTrio(_id: string) {
    return {
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: '2026-05-14T00:00:00.000000Z',
    };
}

test(
    'POST objectives writes the objective and its first'
    + ' revision on the message plane in one operation',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/', {
            id,
            objective: objectiveFields(),
            revisionId: 'sVWUntTCtQYFCpONjkzAKg',
            revision: revisionFields(id, 'Revenue'),
            ...genesisTrio(id),
        }, DEV_TOKEN);
        // Phase Final Task 2: row halves stripped — GET is
        // pair-derived.
        const objective = await GET<{
            id: string;
            position: number;
            organization_id: string;
            state?: string;
        }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            , DEV_TOKEN);
        assert.equal(objective.position, 1);
        // The fence stamped the bound org — never the body.
        assert.equal(objective.organization_id, 'AjdvjuECVZEgZoFajaIEkg');
        // GET streams the stored PUT (G1: trio included).
        assert.equal(objective.state, 'active');
        // The leaf revision route is PUT-only; read the nested
        // per-objective collection and find the revision the
        // create synthesized (the server filters to this id).
        const revisions = await GET<Array<{
            id: string;
            objective_id: string;
            name: string;
        }>>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
            + '/revisions/', DEV_TOKEN);
        const revision = revisions.find(
            r => r.id === 'sVWUntTCtQYFCpONjkzAKg');
        assert.ok(revision);
        assert.equal(revision.objective_id, id);
        assert.equal(revision.name, 'Revenue');
        // Phase Final Stage B: objectives tables retired.
    },
);

test(
    'POST objectives appends nothing when its first'
    + ' revision is malformed',
    async () => {
        const db = await freshDb();
        // An empty revision name is rejected by
        // validateObjectiveRevisionEntity at the route
        // pre-tx (pair formation), so no pairs land and
        // GET cannot derive the objective.
        const id = generateIdentifier();
        await assert.rejects(
            () => POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                + '', {
                id,
                objective: objectiveFields(),
                revisionId: generateIdentifier(),
                revision: revisionFields(id, ''),
                ...genesisTrio(id),
            }, DEV_TOKEN),
        );
        await assert.rejects(
            () => GET(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id, DEV_TOKEN,
            ),
        );
    },
);
