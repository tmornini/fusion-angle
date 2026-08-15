import type { RequestContext } from './shared.ts';
import { UnauthorizedError } from '../../../api/http-errors.ts';
import type {
    SessionCredentials,
} from './session-credentials.ts';
import { isCookieSession } from './session-credentials.ts';
import { generateCryptoSafeBase62 } from
    '../../../shared/crypto-safe-base62.ts';
import { sha256Bytes } from '../../../shared/digest.ts';
import { bytesToBase64Url } from
    '../../../shared/base64url.ts';

// The OAuth client id this web app authenticates as.
const WEB_CLIENT_ID = 'web-app';

// Drive the real OAuth front doors: the interactive password
// loop (/authentication/authorize) yields an authorization code,
// which /authentication/token exchanges for a signed access +
// refresh pair. Returns the credential pair, or null when the
// credentials are bad (a 401 from either door). A non-401 fault
// (a 500, a network error) is a BUG, not a wrong password — it
// propagates. The caller persists and installs the result,
// keeping this free of the global session side effect so it is
// testable.
//
// DEPLOYMENT CONSTRAINT (unchanged): the HMAC signing key is
// still a client-shipped constant, so the token is real but
// forgeable. The flow and algorithm are now real; only the key
// location moves at the server tier. This wiring does NOT lift
// the constraint.
export async function postPasswordLogin(
    ctx: RequestContext,
    username: string,
    password: string,
): Promise<SessionCredentials | null> {
    const verifier = generateCryptoSafeBase62();
    const challenge = bytesToBase64Url(
        await sha256Bytes(verifier),
    );
    let code: string;
    try {
        code = (await ctx.POST<{ code: string }>(
            'authentication/authorize', {
                method: 'password',
                username,
                password,
                client_id: WEB_CLIENT_ID,
                code_challenge: challenge,
                code_challenge_method: 'S256',
            })).code;
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return null;   // bad credentials → no session
        }
        throw err;
    }
    let grant: {
        access_token: string;
        refresh_token?: string;
    };
    try {
        grant = await ctx.POST<{
            access_token: string;
            refresh_token?: string;
        }>('authentication/token', {
            grant_type: 'authorization_code',
            code,
            client_id: WEB_CLIENT_ID,
            code_verifier: verifier,
        });
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            return null;
        }
        throw err;
    }
    return {
        accessToken: grant.access_token,
        refreshToken: isCookieSession()
            ? ''
            : (grant.refresh_token ?? ''),
    };
}
