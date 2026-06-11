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
import {
    latestByKey,
} from '../../../api/ledger-reduction.ts';
import { filterByField } from './shared.ts';
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
    const forIdentity = filterByField(
        all, 'identity_id', identityId,
    );
    // Latest by `at`, not array order — a snapshot reimport
    // or concurrent write can reorder rows. latestByKey's
    // default >= tiebreak is the secure direction.
    const latestByKind = latestByKey(forIdentity, ev => ev.kind);
    const active: IdentityCredentialKind[] = [];
    for (const [kind, last] of latestByKind) {
        if (last.status !== 'revoked') {
            active.push(kind);
        }
    }
    return { active };
}
