export class ApiError {
    readonly message: string;
    readonly status: number;

    constructor(
        message: string,
        status: number,
    ) {
        this.message = message;
        this.status = status;
    }
}

// A 401 from the Bearer gate, raised as a distinct type so the
// web layer can tell "credentials are dead — try to refresh"
// apart from every other failure. Extends Error (unlike
// ApiError) so catch sites matching `instanceof Error` still
// see it; `reason` carries the gate's message verbatim.
export class UnauthorizedError extends Error {
    readonly reason: string;

    constructor(reason: string) {
        super(reason);
        this.name = 'UnauthorizedError';
        this.reason = reason;
    }
}

// Any non-401 non-ok response, raised with its HTTP status so the
// web layer can branch on the status (e.g. 404 -> a clean "not
// found" message) instead of string-matching server prose.
// Extends Error (like UnauthorizedError) so catch sites matching
// `instanceof Error` still see it; `status` carries the HTTP code.
export class RequestError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'RequestError';
        this.status = status;
    }
}

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_NO_CONTENT = 204;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_METHOD_NOT_ALLOWED = 405;
export const HTTP_CONFLICT = 409;
export const HTTP_PRECONDITION_FAILED = 412;
export const HTTP_UNPROCESSABLE_ENTITY = 422;
export const HTTP_INTERNAL_ERROR = 500;
export const HTTP_NOT_IMPLEMENTED = 501;

// A JSON error response at one status — the shape every
// invitation guard returns on rejection.
export function errorJson(
    message: string, status: number,
): Response {
    return Response.json({ error: message }, { status });
}
