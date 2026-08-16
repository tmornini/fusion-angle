import type { RequestContext } from './shared.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../../../api/http-errors.ts';

// Addressed by the caller's own id — the server authorizes an
// identity's default organization by tree ownership. PUT
// { organization_id } must name a live seat (else 400). GET
// returns the SET document or null when never SET (404).
export async function putIdentityDefaultOrganization(
    ctx: RequestContext,
    organization: string,
): Promise<void> {
    await ctx.PUT<void>(
        'identities/' + ctx.identity.id
            + '/default-organization',
        { organization_id: organization },
    );
}

export async function getIdentityDefaultOrganization(
    ctx: RequestContext,
): Promise<string | null> {
    try {
        const res = await ctx.GET<{
            organization_id: string;
        }>(
            'identities/' + ctx.identity.id
                + '/default-organization',
        );
        return res.organization_id;
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_NOT_FOUND
        ) {
            return null;
        }
        throw err;
    }
}
