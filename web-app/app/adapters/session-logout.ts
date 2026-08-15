import type { RequestContext } from './shared.ts';
import {
    postIdentityLogoutEverywhere,
} from './identity-token-revocations.ts';
import {
    deleteSessionCredentials,
} from './session-credentials.ts';
import { deleteSessionToken } from './session-token.ts';

// Sign out: a coarse server-side revoke of every token for this
// identity, then UNCONDITIONAL local teardown. The identity is
// read from the vessel, never passed — ctx is the only argument.
// The local scrub runs in `finally`, so a failed server revoke
// still clears this tab (degrade visibly, never strand a half-
// logged-out session); the server fault is rethrown after the
// scrub, never swallowed.
export async function postSessionLogout(
    ctx: RequestContext,
): Promise<void> {
    try {
        await postIdentityLogoutEverywhere(
            ctx, ctx.identity.id);
    } finally {
        deleteSessionCredentials();
        deleteSessionToken();
    }
}
