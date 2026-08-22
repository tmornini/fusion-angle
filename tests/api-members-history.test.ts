import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

test(
    'GET members/:id/versions is retired 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo');
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/members/XXZruirZyAOoRpNxaDnpSA/versions',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
    },
);

test(
    'GET members/:id/versions absent is retired 404',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/members/missing/versions',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
    },
);
