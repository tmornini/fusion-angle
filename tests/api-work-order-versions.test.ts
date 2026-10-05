import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { validateWorkOrderVersion } from
    '../api/validators.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedCreatedWorkOrder } from './work-order-fixtures.ts';
import {
    apiRequest, messageOfResponse, partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT, nowUtc } from
    '../shared/types.ts';
import type { WorkOrderEntity } from '../shared/types.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const ADMIN = 'XXZruirZyAOoRpNxaDnpSA';
const START = generateIdentifier();
const NEXT = generateIdentifier();

function fields(position: number) {
    return {
        display_id: 'WO-V',
        flow_graph: {
            name: 'Versions', lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [], edges: [],
        },
        position,
    };
}

async function twoVersions() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken(ADMIN, STARK);
    const id = generateIdentifier();
    const head = await seedCreatedWorkOrder(db, {
        organization: STARK, id, fields: fields(1),
        flowId: generateIdentifier(),
        births: [START, NEXT], at: nowUtc(), token,
        claim: 'kept',
    });
    const path = '/organizations/' + STARK
        + '/work-orders/' + id;
    const moved = await handleRequest(db, apiRequest({
        method: 'PUT', path, token,
        headers: {
            'If-Match': head.query('header.etag').toText(),
        },
        body: fields(2),
    }));
    assertStrictEquals(moved.status, 200);
    await moved.body?.cancel();
    return { db, token, id, path };
}

Deno.test('a work order lists its versions oldest first,'
+ ' each part the version its tag serves', async () => {
    const { db, token, path } = await twoVersions();
    const list = await handleRequest(db, apiRequest({
        method: 'GET', path: path + '/versions/', token,
    }));
    assertStrictEquals(list.status, 200);
    const parts = await partsOf<WorkOrderEntity>(list);
    assertEquals(
        parts.map((part) => part.body().toValue().position),
        [1, 2],
    );
    for (const part of parts) {
        validateWorkOrderVersion(
            part.body().toValue() as unknown as
                Record<string, unknown>,
        );
        const tag = part.query('header.etag').toText()
            .slice(1, -1);
        const item = await handleRequest(db, apiRequest({
            method: 'GET',
            path: path + '/versions/' + tag, token,
        }));
        assertStrictEquals(item.status, 200);
        const served = await messageOfResponse(item);
        assertStrictEquals(
            served.withFieldDeleted('date')
                .withFieldDeleted('request-id').toWire(),
            part.withFieldDeleted('date')
                .withFieldDeleted('request-id').toWire(),
        );
    }
});

// The fence answers before any head is read; a foreign id under
// one's own path is 404.
Deno.test('another organization\'s path answers 403 for'
+ ' work-order versions (the fence)', async () => {
    const { db, id } = await twoVersions();
    const token = await organizationToken(ADMIN, WAYNE);
    for (const suffix of [
        '/versions/', '/versions/' + generateIdentifier(),
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'GET',
            path: '/organizations/' + STARK
                + '/work-orders/' + id + suffix,
            token,
        }));
        assertStrictEquals(res.status, 403, suffix);
        await res.body?.cancel();
    }
});

Deno.test('an absent work order\'s versions answer 404',
async () => {
    const { db, token } = await twoVersions();
    const path = '/organizations/' + STARK
        + '/work-orders/' + generateIdentifier();
    for (const suffix of [
        '/versions/', '/versions/' + generateIdentifier(),
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'GET', path: path + suffix, token,
        }));
        assertStrictEquals(res.status, 404, suffix);
        await res.body?.cancel();
    }
});

Deno.test('a tag naming no PUT of the work order answers'
+ ' 404', async () => {
    const first = await twoVersions();
    const other = await seedCreatedWorkOrder(first.db, {
        organization: STARK, id: generateIdentifier(),
        fields: fields(3), flowId: generateIdentifier(),
        births: [START, NEXT], at: nowUtc(),
        token: first.token, claim: 'kept',
    });
    const res = await handleRequest(first.db, apiRequest({
        method: 'GET',
        path: first.path + '/versions/'
            + other.query('header.etag').toText()
                .slice(1, -1),
        token: first.token,
    }));
    assertStrictEquals(res.status, 404);
    await res.body?.cancel();
});

Deno.test('a member reads a work order\'s versions',
async () => {
    const { db, path } = await twoVersions();
    const member = await organizationToken(
        'MQFcPtrZPIGjMCRAXtZUnA', STARK,
    );
    const res = await handleRequest(db, apiRequest({
        method: 'GET', path: path + '/versions/',
        token: member,
    }));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
});
