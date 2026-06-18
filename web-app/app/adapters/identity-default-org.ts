import type { RequestContext } from './shared.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import { nowUtc } from '../../../api/types.ts';

// Addressed by the caller's own id — the server authorizes an
// identity's default org by tree ownership. PUT is idempotent
// (append-on-change server-side); a non-member org is refused
// as a 403, surfaced here as a thrown error. The row id
// (eventId) and timestamp (at) are caller-minted.
export async function putIdentityDefaultOrg(
    ctx: RequestContext,
    org: string,
): Promise<void> {
    await ctx.PUT<void>(
        'identities/' + ctx.identity.id + '/default-org',
        {
            eventId: generateCryptoSafeBase62(),
            organization_id: org,
            at: nowUtc(),
        },
    );
}

export async function getIdentityDefaultOrg(
    ctx: RequestContext,
): Promise<string | null> {
    const res = await ctx.GET<{
        organization_id: string | null;
    }>('identities/' + ctx.identity.id + '/default-org');
    return res.organization_id;
}
