import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type AuthorizationCodeStatus,
    type AuthorizationCodeEntity,
} from '../../../api/types.ts';
import {
    codeState,
    type CodeState,
} from '../../../api/authorization-codes.ts';
import type { RequestContext } from './shared.ts';

async function appendCodeEvent(
    ctx: RequestContext,
    code: string,
    identityId: Id,
    clientId: Id,
    status: AuthorizationCodeStatus,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(`authorization-codes/${id}`, {
        code,
        identity_id: identityId,
        client_id: clientId,
        status,
        at: nowUtc(),
    });
}

// Issue a fresh opaque authorization code bound to (identity,
// client). Returns the code so the caller can hand it to the
// browser for the token exchange.
export async function postCodeIssue(
    ctx: RequestContext,
    identityId: Id,
    clientId: Id,
): Promise<string> {
    const code = generateCryptoSafeBase62();
    await appendCodeEvent(
        ctx, code, identityId, clientId, 'issued',
    );
    return code;
}

export async function postCodeConsumption(
    ctx: RequestContext,
    code: string,
    identityId: Id,
    clientId: Id,
): Promise<void> {
    await appendCodeEvent(
        ctx, code, identityId, clientId, 'consumed',
    );
}

export type { CodeState };

// The current state of an authorization code (null if unknown).
// The reduce lives in api/ so the token endpoint shares it.
export async function getCodeState(
    ctx: RequestContext,
    code: string,
): Promise<CodeState | null> {
    const all = await ctx.GET<AuthorizationCodeEntity[]>(
        'authorization-codes',
    );
    return codeState(all, code);
}
