export interface StatusDocument {
    readonly code: number;
    readonly body: unknown | null;
}

// body: null means empty (204) or "the verb room
// shows the success representation."
export const STATUS_DOCUMENTS: readonly
    StatusDocument[] = [
    { code: 200, body: null },
    { code: 201, body: null },
    { code: 204, body: null },
    {
        code: 400,
        body: { error: 'validation message' },
    },
    {
        code: 401,
        body: { error: 'invalid_token' },
    },
    {
        code: 403,
        body: {
            error:
                'forbidden: path organization'
                + ' does not match the token'
                + ' organization',
        },
    },
    {
        code: 404,
        body: { error: 'Not found: /path' },
    },
    {
        code: 405,
        body: {
            error:
                'Method GET not allowed on /path',
        },
    },
    {
        code: 409,
        body: { error: 'conflict message' },
    },
    {
        code: 412,
        body: { error: 'precondition failed' },
    },
    {
        code: 422,
        body: { error: 'unprocessable message' },
    },
    {
        code: 428,
        body: { error: 'If-Match required' },
    },
    {
        code: 429,
        body: { error: 'too many requests' },
    },
];
