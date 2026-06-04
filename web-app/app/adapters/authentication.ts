import type { RequestContext } from './shared.ts';

// The OAuth client id this web app authenticates as.
const WEB_CLIENT_ID = 'web-app';

// Drive the real OAuth front doors: the interactive password
// loop (/authentication/authorize) yields an authorization code,
// which /authentication/token exchanges for a signed access +
// refresh pair. Returns the access token, or null on any failure
// (bad credentials, etc.). The caller installs it as the per-tab
// session — keeping this free of the global session side effect
// so it is testable.
//
// DEPLOYMENT CONSTRAINT (unchanged): the HMAC signing key is
// still a client-shipped constant, so the token is real but
// forgeable. The flow and algorithm are now real; only the key
// location moves at the server tier. This wiring does NOT lift
// the constraint.
export async function loginViaPassword(
    ctx: RequestContext,
    username: string,
    password: string,
): Promise<string | null> {
    let code: string;
    try {
        code = (await ctx.POST<{ code: string }>(
            'authentication/authorize', {
                method: 'password',
                username,
                password,
                client_id: WEB_CLIENT_ID,
            })).code;
    } catch {
        return null;   // bad credentials → no session
    }
    try {
        return (await ctx.POST<{ access_token: string }>(
            'authentication/token', {
                grant_type: 'authorization_code',
                code,
            })).access_token;
    } catch {
        return null;
    }
}
