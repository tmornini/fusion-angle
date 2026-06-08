import type {
    Id,
    AuthorizationCodeStatus,
    AuthorizationCodeEntity,
} from './types.ts';
import { latestByKey } from './ledger-reduction.ts';

export interface CodeState {
    readonly status: AuthorizationCodeStatus;
    readonly identityId: Id;
    readonly clientId: Id;
}

// The current state of an authorization code (null if unknown):
// the latest status for the code, plus the (identity, client) it
// was issued to. HYBRID: status is latest-wins (latestByKey's
// default >= tiebreak), but identity and client come from the
// FIRST event — they are fixed at issue and never reassigned.
export function codeState(
    rows: readonly AuthorizationCodeEntity[],
    code: string,
): CodeState | null {
    const forCode = rows.filter(r => r.code === code);
    const first = forCode[0];
    if (first === undefined) return null;
    const latest = latestByKey(forCode, r => r.code).get(code)!;
    return {
        status: latest.status,
        identityId: first.identity_id,
        clientId: first.client_id,
    };
}
