import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Bulk GET objectives/versions is deleted. Callers fan-in
// per-item GET objectives/:id/versions/ (collection-item
// shape: state, not StateEntity).

interface VersionRow {
    id: string;
    state: string;
}

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: operationId ?? TEST_OPERATION_ID,
    });
}

function objectiveBody(
    state: string,
    stateAt: string,
    stateEventId: string,
) {
    return {
        position: 1,
        state,
    };
}

async function putObjective(
    db: MemoryDbAdapter,
    id: string,
    token: string,
    state: string,
    stateAt: string,
    eventSuffix: string,
    organization = 'AjdvjuECVZEgZoFajaIEkg',
): Promise<void> {
    const res = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/' + organization
                + '/objectives/' + id,
            token,
            objectiveBody(
                state, stateAt, id + '-' + eventSuffix,
            ),
            generateIdentifier(),
        ),
    );
    assert.equal(res.status, 201);
}

test(
    'GET organizations/.../objectives/versions is 400;'
    + ' trailing slash is 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = generateIdentifier();
        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );

        const slashless = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg'
                    + '/objectives/versions',
                DEV_TOKEN,
            ),
        );
        assert.equal(slashless.status, 400);
        const slashlessBody = await slashless.json() as {
            error: string;
        };
        assert.equal(
            slashlessBody.error,
            'id must be a 22-character identifier',
        );

        const slashed = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg'
                    + '/objectives/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(slashed.status, 404);
    },
);

test(
    'GET organizations/:id/objectives/:id/versions/ is 200;'
    + ' archive/reactivate/re-archive keeps both archived',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = generateIdentifier();

        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-01T00:00:00.000000Z', 'ev1',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'archived',
            '2026-04-02T00:00:00.000000Z', 'ev2',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'active',
            '2026-04-03T00:00:00.000000Z', 'ev3',
        );
        await putObjective(
            db, id, DEV_TOKEN, 'archived',
            '2026-04-04T00:00:00.000000Z', 'ev4',
        );

        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as VersionRow[];
        assert.equal(rows.length, 4);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'archived');
        const archived = rows.filter(
            (row) => row.state === 'archived',
        );
        assert.equal(archived.length, 2);
    },
);
