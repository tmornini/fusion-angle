import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapPostgresError } from
    '../api/errors-postgres.ts';
import {
    ApiError,
    HTTP_GATEWAY_TIMEOUT,
    HTTP_INTERNAL_ERROR,
} from '../api/http-errors.ts';
import {
    MissingTableError,
    EntityNotFoundError,
    ForeignOrganizationError,
} from '../api/db.ts';

function assertWire(
    error: unknown,
    status: number,
    message: string,
): void {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, status);
    assert.equal(error.message, message);
}

test('duplicate PK is loud 500', () => {
    assertWire(
        mapPostgresError({
            code: '23505',
            constraint: 'requests_pkey',
        }),
        HTTP_INTERNAL_ERROR,
        'duplicate primary key',
    );
    assertWire(
        mapPostgresError({
            code: '23505',
            constraint: 'responses_pkey',
        }),
        HTTP_INTERNAL_ERROR,
        'duplicate primary key',
    );
});

test('constraint_name maps like constraint', () => {
    assertWire(
        mapPostgresError({
            code: '23505',
            constraint_name: 'requests_pkey',
        }),
        HTTP_INTERNAL_ERROR,
        'duplicate primary key',
    );
});

test('other unique is loud 500', () => {
    assertWire(
        mapPostgresError({
            code: '23505',
            constraint: 'requests_hash_key',
        }),
        HTTP_INTERNAL_ERROR,
        'unique constraint',
    );
});

test('bad JSON at GIN is loud 500', () => {
    assertWire(
        mapPostgresError({ code: '22P02' }),
        HTTP_INTERNAL_ERROR,
        'bad JSON at GIN',
    );
});

test('responses_request_fk is loud 500', () => {
    assertWire(
        mapPostgresError({
            code: '23503',
            constraint: 'responses_request_fk',
        }),
        HTTP_INTERNAL_ERROR,
        'torn pair: responses_request_fk',
    );
    assertWire(
        mapPostgresError({
            constraint: 'responses_request_fk',
        }),
        HTTP_INTERNAL_ERROR,
        'torn pair: responses_request_fk',
    );
});

test('CHECK failed is loud 500', () => {
    assertWire(
        mapPostgresError({
            code: '23514',
            constraint: 'requests_id_chk',
        }),
        HTTP_INTERNAL_ERROR,
        'check failed',
    );
    assertWire(
        mapPostgresError({
            constraint: 'requests_at_chk',
        }),
        HTTP_INTERNAL_ERROR,
        'check failed',
    );
});

test('deadlock 40P01 is loud 500', () => {
    assertWire(
        mapPostgresError({ code: '40P01' }),
        HTTP_INTERNAL_ERROR,
        'deadlock',
    );
});

test('timeout and connection loss are 504', () => {
    for (const code of [
        'CONNECT_TIMEOUT',
        'CONNECTION_CLOSED',
        'CONNECTION_ENDED',
        'CONNECTION_DESTROYED',
        '57014',
        'ECONNRESET',
    ]) {
        assertWire(
            mapPostgresError({ code }),
            HTTP_GATEWAY_TIMEOUT,
            'gateway timeout',
        );
    }
});

test('missing table is loud 500, not recovery', () => {
    const mapped = mapPostgresError({ code: '42P01' });
    assertWire(
        mapped,
        HTTP_INTERNAL_ERROR,
        'missing table',
    );
    assert.equal(
        mapped instanceof MissingTableError,
        false,
    );
});

test('plain errors pass through', () => {
    const err = new Error('getWhere does not accept uri_id');
    assert.equal(mapPostgresError(err), err);
});

test('ApiError passes through', () => {
    const err = new ApiError('already', 409);
    assert.equal(mapPostgresError(err), err);
});

test('EntityNotFoundError passes through', () => {
    const err = new EntityNotFoundError(
        'identity_pii', 'x',
    );
    assert.equal(mapPostgresError(err), err);
});

test('ForeignOrganizationError passes through', () => {
    const err = new ForeignOrganizationError(
        'identity_pii', 'x',
    );
    assert.equal(mapPostgresError(err), err);
});
