// Map Postgres faults to wire errors by constraint name.
// SQLSTATE is used only when it is the whole story
// (deadlock, timeout, missing table, bad JSON at GIN).
// Deadlock is loud 500 — no retry.

import {
    ApiError,
    HTTP_GATEWAY_TIMEOUT,
    HTTP_INTERNAL_ERROR,
} from './http-errors.ts';

const TIMEOUT_CODES = new Set([
    'CONNECT_TIMEOUT',
    'CONNECTION_CLOSED',
    'CONNECTION_ENDED',
    'CONNECTION_DESTROYED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EPIPE',
    '57014',
    '08000',
    '08001',
    '08003',
    '08004',
    '08006',
    '57P01',
    '57P02',
    '57P03',
]);

interface Fault {
    readonly code: string | undefined;
    readonly constraint: string | undefined;
}

export function mapPostgresError(
    error: unknown,
): Error | ApiError {
    if (error instanceof ApiError) {
        return error;
    }
    const fault = faultOf(error);
    if (fault === null) {
        return error instanceof Error
            ? error
            : new Error(String(error));
    }
    return new ApiError(
        messageOf(fault),
        statusOf(fault),
    );
}

function faultOf(error: unknown): Fault | null {
    if (error === null || typeof error !== 'object') {
        return null;
    }
    const rec = error as Record<string, unknown>;
    const code = asString(rec.code);
    const constraint = asString(rec.constraint)
        ?? asString(rec.constraint_name);
    if (code === undefined && constraint === undefined) {
        return null;
    }
    return { code, constraint };
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export function isUndefinedTable(
    error: unknown,
): boolean {
    if (error === null || typeof error !== 'object') {
        return false;
    }
    const code = (error as { code?: unknown }).code;
    return code === '42P01';
}

function statusOf(fault: Fault): number {
    if (isTimeout(fault)) {
        return HTTP_GATEWAY_TIMEOUT;
    }
    return HTTP_INTERNAL_ERROR;
}

function isTimeout(fault: Fault): boolean {
    return fault.code !== undefined
        && TIMEOUT_CODES.has(fault.code);
}

function isPrimaryKey(fault: Fault): boolean {
    if (
        fault.constraint !== undefined
        && fault.constraint.endsWith('_pkey')
    ) {
        return true;
    }
    return fault.code === '23505'
        && fault.constraint === undefined;
}

function isCheck(fault: Fault): boolean {
    if (fault.code === '23514') {
        return true;
    }
    return fault.constraint !== undefined
        && fault.constraint.endsWith('_chk');
}

function messageOf(fault: Fault): string {
    if (isTimeout(fault)) {
        return 'gateway timeout';
    }
    if (fault.code === '40P01') {
        return 'deadlock';
    }
    if (isUndefinedTable(fault)) {
        return 'missing table';
    }
    if (fault.code === '22P02') {
        return 'bad JSON at GIN';
    }
    if (
        fault.constraint === 'responses_request_fk'
        || fault.code === '23503'
    ) {
        return 'torn pair: responses_request_fk';
    }
    if (isPrimaryKey(fault)) {
        return 'duplicate primary key';
    }
    if (fault.code === '23505') {
        return 'unique constraint';
    }
    if (isCheck(fault)) {
        return 'check failed';
    }
    return 'postgres error';
}
