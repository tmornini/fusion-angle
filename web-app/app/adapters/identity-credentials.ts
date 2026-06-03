import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityCredentialEntity,
    type IdentityCredentialKind,
    type IdentityCredentialStatus,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

async function appendCredentialEvent(
    ctx: RequestContext,
    identityId: Id,
    kind: IdentityCredentialKind,
    status: IdentityCredentialStatus,
    secret: string,
): Promise<void> {
    const id = generateCryptoSafeBase62();
    await ctx.PUT(`identity-credentials/${id}`, {
        identity_id: identityId,
        kind,
        status,
        secret,
        at: nowUtc(),
    });
}

export async function postIdentityCredentialSet(
    ctx: RequestContext,
    identityId: Id,
    kind: IdentityCredentialKind,
    secret: string,
): Promise<void> {
    await appendCredentialEvent(
        ctx, identityId, kind, 'set', secret,
    );
}

export async function postIdentityCredentialRotation(
    ctx: RequestContext,
    identityId: Id,
    kind: IdentityCredentialKind,
    secret: string,
): Promise<void> {
    await appendCredentialEvent(
        ctx, identityId, kind, 'rotated', secret,
    );
}

export async function
postIdentityCredentialRevocation(
    ctx: RequestContext,
    identityId: Id,
    kind: IdentityCredentialKind,
): Promise<void> {
    // a revocation carries no new secret — the prior
    // material is simply marked revoked by a new event
    await appendCredentialEvent(
        ctx, identityId, kind, 'revoked', '',
    );
}

export interface IdentityCredentialState {
    active: IdentityCredentialKind[];
}

// Reduce the ledger to the CURRENT validity per kind.
// The secret is deliberately NOT part of the returned
// shape — it never escapes this boundary on read.
export async function getIdentityCredentialState(
    ctx: RequestContext,
    identityId: Id,
): Promise<IdentityCredentialState> {
    const all = await ctx.GET<
        IdentityCredentialEntity[]
    >('identity-credentials');
    const latestByKind = new Map<
        IdentityCredentialKind,
        IdentityCredentialStatus
    >();
    for (const ev of all) {
        if (ev.identity_id !== identityId) continue;
        // append order is chronological → last wins
        latestByKind.set(ev.kind, ev.status);
    }
    const active: IdentityCredentialKind[] = [];
    for (const [kind, status] of latestByKind) {
        if (status !== 'revoked') {
            active.push(kind);
        }
    }
    return { active };
}
