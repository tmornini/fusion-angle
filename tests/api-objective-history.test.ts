import { assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
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
        ...(token !== undefined ? { token } : {}),
        body,
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

function objectiveBody(state: string) {
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
    organization = 'AjdvjuECVZEgZoFajaIEkg',
): Promise<void> {
    const res = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/' + organization
                + '/objectives/' + id,
            token,
            objectiveBody(state),
            generateIdentifier(),
        ),
    );
    assertStrictEquals(res.status, 201);
}

Deno.test(
    'GET organizations/.../objectives/versions is 400;'
    + ' trailing slash is 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = generateIdentifier();
        await putObjective(db, id, DEV_TOKEN, 'active');

        const slashless = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg'
                    + '/objectives/versions',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(slashless.status, 400);
        const slashlessBody = await slashless.json() as {
            error: string;
        };
        assertStrictEquals(
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
        assertStrictEquals(slashed.status, 404);
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions/ is 200;'
    + ' archive/reactivate/re-archive keeps both archived',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const id = generateIdentifier();

        await putObjective(db, id, DEV_TOKEN, 'active');
        await putObjective(db, id, DEV_TOKEN, 'archived');
        await putObjective(db, id, DEV_TOKEN, 'active');
        await putObjective(db, id, DEV_TOKEN, 'archived');

        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as VersionRow[];
        assertStrictEquals(rows.length, 4);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'archived');
        const archived = rows.filter(
            (row) => row.state === 'archived',
        );
        assertStrictEquals(archived.length, 2);
    },
);
