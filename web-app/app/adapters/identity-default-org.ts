import type { RequestContext } from './shared.ts';

// Addressed by the caller's own id — the server authorizes an
// identity's default org by tree ownership. PUT is idempotent
// (append-on-change server-side); a non-member org is refused
// as a 403, surfaced here as a thrown error.
export async function putIdentityDefaultOrg(
    ctx: RequestContext,
    org: string,
): Promise<void> {
    await ctx.PUT<void>(
        'identities/' + ctx.identity.id + '/default-org',
        { organization_id: org },
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
