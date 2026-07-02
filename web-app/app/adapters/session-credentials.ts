import { decodeAccessToken } from '../../../api/access-token.ts';

// The persisted session credential: the OAuth token pair the
// web tier holds so a login survives the navigateTo() reload.
// Domain shape is camelCase; the stored JSON is snake_case to
// match the OAuth wire (access_token / refresh_token), so a
// blob reads straight against a network trace. An immutable
// value — replaced, never mutated.
export interface SessionCredentials {
    readonly accessToken: string;
    readonly refreshToken: string;
}

// A present-but-unreadable credential blob: bad JSON, a missing
// or empty field, or a token string that fails decodeAccessToken.
// Distinct from honest absence (null) so a caller scrubs a
// poisoned store and bounces to login, rather than trusting it
// as "logged out and fine".
export class SessionCredentialsCorruptError extends Error {
    constructor(reason: string) {
        super(reason);
        this.name = 'SessionCredentialsCorruptError';
    }
}

// NOT under the localStorage backend's 'fusion-ai:' table
// namespace: a credential is session state, not schema
// data, and must survive a deleteSchema wipe of the table
// keys. Mirrors ACTIVE_ORGANIZATION_KEY ('fusion.active-org').
const SESSION_CREDENTIALS_KEY = 'fusion.session-credentials';

// Parse + validate at the gate. null ONLY for honest absence
// (logged out / first run); a present-but-broken blob throws
// Corrupt and is never null-masked.
export function getSessionCredentials():
    SessionCredentials | null {
    const raw = localStorage.getItem(SESSION_CREDENTIALS_KEY);
    if (raw === null) {
        return null;
    }
    const blob = parseBlob(raw);
    return {
        accessToken: tokenField(blob, 'access_token'),
        refreshToken: tokenField(blob, 'refresh_token'),
    };
}

// One setItem, one JSON object. Does NOT swallow a write
// failure into a boolean (the deliberate divergence from
// preferences.ts): a credential that cannot persist is a login
// that cannot stick — let it crash.
export function putSessionCredentials(
    creds: SessionCredentials,
): void {
    localStorage.setItem(
        SESSION_CREDENTIALS_KEY,
        JSON.stringify({
            access_token: creds.accessToken,
            refresh_token: creds.refreshToken,
        }),
    );
}

// Idempotent: removing an absent credential is a no-op.
export function deleteSessionCredentials(): void {
    localStorage.removeItem(SESSION_CREDENTIALS_KEY);
}

function parseBlob(raw: string): Record<string, unknown> {
    const value = parseJson(raw);
    if (typeof value !== 'object' || value === null) {
        throw new SessionCredentialsCorruptError(
            'credential blob is not an object',
        );
    }
    return value as Record<string, unknown>;
}

function parseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        throw new SessionCredentialsCorruptError(
            'credential blob is not valid JSON',
        );
    }
}

function tokenField(
    blob: Record<string, unknown>,
    key: string,
): string {
    const value = blob[key];
    if (typeof value !== 'string' || value === '') {
        throw new SessionCredentialsCorruptError(
            `credential ${key} missing or empty`,
        );
    }
    assertDecodable(key, value);
    return value;
}

function assertDecodable(key: string, token: string): void {
    try {
        decodeAccessToken(token);
    } catch {
        throw new SessionCredentialsCorruptError(
            `credential ${key} is not a decodable token`,
        );
    }
}
