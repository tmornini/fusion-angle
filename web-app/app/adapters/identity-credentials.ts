import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    nowUtc,
    type Id,
    type IdentityCredentialEntity,
    type IdentityCredentialKind,
    type IdentityCredentialStatus,
} from '../../../api/types.ts';
import { hashPassword } from '../../../api/password-hash.ts';
import type { RequestContext } from './shared.ts';

// Surface the credential-kind union so the identity detail
// presenter speaks one tongue through the adapter barrel.
export type { IdentityCredentialKind };

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
        ctx, identityId, kind, 'set',
        await hashPassword(secret),
    );
}

export async function postIdentityCredentialRotation(
    ctx: RequestContext,
    identityId: Id,
    kind: IdentityCredentialKind,
    secret: string,
): Promise<void> {
    await appendCredentialEvent(
        ctx, identityId, kind, 'rotated',
        await hashPassword(secret),
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
        { status: IdentityCredentialStatus; at: string }
    >();
    for (const ev of all) {
        if (ev.identity_id !== identityId) continue;
        // Latest by `at`, not array order — a snapshot
        // reimport or concurrent write can reorder rows.
        // Same secure `>=` tie-break as currentRolesForInOrg.
        const prev = latestByKind.get(ev.kind);
        if (prev === undefined || ev.at >= prev.at) {
            latestByKind.set(
                ev.kind,
                { status: ev.status, at: ev.at },
            );
        }
    }
    const active: IdentityCredentialKind[] = [];
    for (const [kind, last] of latestByKind) {
        if (last.status !== 'revoked') {
            active.push(kind);
        }
    }
    return { active };
}
