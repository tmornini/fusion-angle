import type {
    Id,
    AuthorizationCodeStatus,
    AuthorizationCodeEntity,
} from './types.ts';

export interface CodeState {
    readonly status: AuthorizationCodeStatus;
    readonly identityId: Id;
    readonly clientId: Id;
}

// The current state of an authorization code (null if unknown):
// the latest status for the code, plus the (identity, client) it
// was issued to. RFC-3339 zulu `at` orders the events; a
// same-instant tie keeps the later-appended row (>=).
export function codeState(
    rows: readonly AuthorizationCodeEntity[],
    code: string,
): CodeState | null {
    const forCode = rows.filter(r => r.code === code);
    const first = forCode[0];
    if (first === undefined) return null;
    let latest = first;
    for (const r of forCode) {
        if (r.at >= latest.at) latest = r;
    }
    return {
        status: latest.status,
        identityId: first.identity_id,
        clientId: first.client_id,
    };
}
