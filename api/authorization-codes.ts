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

// On an equal-`at` tie the FAIL-CLOSED status wins regardless
// of row order — a consume beats a co-timestamped issue on
// every backend (replay protection). Equal statuses fall to
// the id tail for determinism.
const STATUS_RANK: Record<AuthorizationCodeStatus, number> = {
    consumed: 1,
    issued: 0,
};

function failClosed(
    candidate: AuthorizationCodeEntity,
    incumbent: AuthorizationCodeEntity,
): boolean {
    if (candidate.at !== incumbent.at) {
        return candidate.at > incumbent.at;
    }
    const c = STATUS_RANK[candidate.status];
    const i = STATUS_RANK[incumbent.status];
    if (c !== i) return c > i;
    return candidate.id > incumbent.id;
}

// The current state of an authorization code (null if unknown):
// the latest status for the code, plus the (identity, client) it
// was issued to. HYBRID: status is latest-wins with the
// fail-closed tie above, but identity and client come from the
// FIRST event — they are fixed at issue and never reassigned.
export function codeState(
    rows: readonly AuthorizationCodeEntity[],
    code: string,
): CodeState | null {
    const forCode = rows.filter(r => r.code === code);
    const first = forCode[0];
    if (first === undefined) return null;
    const latest = latestByKey(
        forCode, r => r.code, failClosed,
    ).get(code)!;
    return {
        status: latest.status,
        identityId: first.identity_id,
        clientId: first.client_id,
    };
}
