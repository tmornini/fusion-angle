import {
    assertInstanceOf,
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { routes, type Route } from '../api/routes.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    apiRequest,
    framedRequest,
} from './http-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import {
    incomingContext,
} from '../api/request-context.ts';
import { REQUEST_ID_HEADER } from '../shared/message-id-fields.ts';
import { validateWorkOrderTransitionBody } from
    '../api/validators.ts';
import { ValidationError } from '../shared/types.ts';

const SKIP_PARAMS = new Set(['name']);

function verbsOn(route: Route): string[] {
    const verbs: string[] = [];
    if (route.get !== undefined || route.select !== undefined) {
        verbs.push('GET');
    }
    if (route.put !== undefined) verbs.push('PUT');
    if (route.patch !== undefined) verbs.push('PATCH');
    if (route.delete !== undefined) verbs.push('DELETE');
    if (route.post !== undefined) verbs.push('POST');
    return verbs;
}

function pathOf(
    route: Route,
    badIndex: number,
    badValue: string,
): string {
    const segs = route.segments.map((seg, i) => {
        if (!seg.startsWith(':')) return seg;
        if (i === badIndex) return badValue;
        // A later param is reached only when this
        // sibling already passes its own rule.
        if (seg === ':membership-id') {
            return membershipNameOf(
                generateIdentifier(),
                generateIdentifier(),
            );
        }
        return generateIdentifier();
    });
    return '/' + segs.join('/');
}

Deno.test('malformed identifier path params are 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const failures: string[] = [];
    for (const route of routes) {
        for (let i = 0; i < route.segments.length; i++) {
            const seg = route.segments[i]!;
            if (!seg.startsWith(':')) continue;
            const name = seg.slice(1);
            if (SKIP_PARAMS.has(name)) continue;
            const path = pathOf(
                route, i, 'not-an-identifier',
            );
            const expected = name === 'membership-id'
                ? 'membership-id must be two identifiers'
                    + ' joined by one colon'
                : name
                    + ' must be a 22-character identifier';
            for (const method of verbsOn(route)) {
                const write = method !== 'GET';
                const res = await handleRequest(
                    db,
                    apiRequest({
                        method,
                        path,
                        token: DEV_TOKEN,
                        body: write ? {} : undefined,
                    }),
                );
                const text = await res.text();
                let body: { error?: string } = {};
                if (text !== '') {
                    try {
                        body = JSON.parse(text) as {
                            error?: string;
                        };
                    } catch {
                        body = { error: text };
                    }
                }
                if (
                    res.status !== 400
                    || body.error !== expected
                ) {
                    failures.push(
                        method + ' ' + path
                            + ' → ' + res.status
                            + ' '
                            + JSON.stringify(body)
                            + ' want 400 '
                            + JSON.stringify({
                                error: expected,
                            }),
                    );
                }
            }
        }
    }
    assertStrictEquals(failures.join('\n'), '');
});

Deno.test('malformed :etag is the identifier-gate 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/' + org
                + '/versions/not-an-etag',
            token: DEV_TOKEN,
        }),
    );
    const body = await res.json() as { error?: string };
    assertStrictEquals(res.status, 400);
    assertStrictEquals(
        body.error,
        'etag must be a 22-character identifier',
    );
});

Deno.test('malformed :name is not the identifier-gate 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const flow = generateIdentifier();
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/' + org
                + '/flows/' + flow
                + '/tags/not-an-identifier',
            token: DEV_TOKEN,
        }),
    );
    const body = await res.json() as { error?: string };
    assertNotStrictEquals(
        body.error,
        'name must be a 22-character identifier',
    );
});

Deno.test('malformed instance :etag is the identifier-gate 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const typeId = generateIdentifier();
    const instanceId = generateIdentifier();
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/' + org
                + '/record-types/' + typeId
                + '/instances/' + instanceId
                + '/versions/not-an-identifier',
            token: DEV_TOKEN,
        }),
    );
    const body = await res.json() as { error?: string };
    assertStrictEquals(res.status, 400);
    assertStrictEquals(
        body.error,
        'etag must be a 22-character identifier',
    );
});

Deno.test('incomingContext mints when request-id is absent',
async () => {
    const db = memoryDbAdapter();
    const ctx = await incomingContext(
        db,
        framedRequest('http://localhost/ideas/'),
    );
    assertStrictEquals(isIdentifier(ctx.requestId), true);
});

Deno.test(
    'incomingContext mints past a carried request-id',
async () => {
    const db = memoryDbAdapter();
    const id = generateIdentifier();
    const ctx = await incomingContext(
        db,
        framedRequest('http://localhost/ideas/', {
            headers: { [REQUEST_ID_HEADER]: id },
        }),
    );
    assertStrictEquals(isIdentifier(ctx.requestId), true);
    assertNotStrictEquals(ctx.requestId, id);
});

Deno.test('incomingContext mints a malformed request-id',
async () => {
    const db = memoryDbAdapter();
    const ctx = await incomingContext(
        db,
        framedRequest('http://localhost/ideas/', {
            headers: {
                [REQUEST_ID_HEADER]: 'not-an-identifier',
            },
        }),
    );
    assertStrictEquals(isIdentifier(ctx.requestId), true);
    assertNotStrictEquals(
        ctx.requestId, 'not-an-identifier',
    );
});

Deno.test('a carried Request-ID is 400 before auth',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const res = await handleRequest(
        db,
        apiRequest({
            method: 'GET',
            path: '/organizations/' + org + '/ideas/',
            token: DEV_TOKEN,
            headers: {
                [REQUEST_ID_HEADER]: 'not-an-identifier',
            },
        }),
    );
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Request-ID is minted by the server',
    );
});

Deno.test('unauthenticated carried Request-ID is 400',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const res = await handleRequest(
        db,
        framedRequest(
            'http://localhost/organizations/'
                + org + '/ideas/',
            {
                headers: {
                    [REQUEST_ID_HEADER]:
                        'not-an-identifier',
                },
            },
        ),
    );
    assertStrictEquals(res.status, 400);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Request-ID is minted by the server',
    );
});

Deno.test('present transition instance_id must be an'
+ ' identifier', () => {
    const err = assertThrows(
        () => validateWorkOrderTransitionBody({
            transitionEventId: 'te-val',
            targetState: 'n-next',
            instance_id: 'not-an-identifier',
            record_type_id: 'rt-1',
            set: [{
                attribute_id: generateIdentifier(),
                value: 'x',
            }],
            release: null,
            transitionAt:
                '2026-01-01T00:00:00.000000Z',
        }),
    ) as Error;
    assertInstanceOf(err, ValidationError);
    assertStrictEquals(
        err.message,
        'instance_id must be a 22-character identifier',
    );
});
