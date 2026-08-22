import {
    generateIdentifier,
} from '../../../shared/identifier.ts';
import {
    nowUtc,
    type Id,
    type IdentityCredentialEntity,
    type IdentityCredentialKind,
    type IdentityCredentialStatus,
} from '../../../api/types.ts';
import {
    latestByKey,
} from '../../../shared/ledger-reduction.ts';
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
    const id = generateIdentifier();
    await ctx.PUT(
        `identities/${identityId}/credentials/${id}`,
        {
            identity_id: identityId,
            kind,
            status,
            secret,
            at: nowUtc(),
        },
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
    // The server filters the nested collection to the parent
    // identity by its identity_id FK, so no client filter is
    // needed.
    const forIdentity = await ctx.GET<
        IdentityCredentialEntity[]
    >('identities/' + identityId + '/credentials/');
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
