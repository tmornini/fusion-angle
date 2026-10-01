import type { RequestContext } from './request-context.ts';
import {
    RequestError,
    UnauthorizedError,
} from '../shared/http-errors.ts';
import type {
    SessionCredentials,
} from './session-credentials.ts';
import { generateSecret } from
    '../shared/secret.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from
    '../shared/base64url.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';

export function basicAuthorization(
    userId: string,
    password: string,
): string {
    if (userId.includes(':')) {
        throw new Error('user-id contains a colon');
    }
    const bytes = new TextEncoder().encode(
        userId + ':' + password,
    );
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return 'Basic ' + btoa(binary);
}

// The named parameter of an authentication-info line, or
// null when the parameter is absent. The recovery layer
// hands the raw line it read from a response; a verb hands
// the message it was answered, whose absent line answers
// null the same way.
export function authParam(
    source: HttpMessage | string | null,
    name: string,
): string | null {
    if (source instanceof HttpMessage) {
        const line = source.query('header.authentication-info');
        return authParam(line.exists() ? line.toText() : null, name);
    }
    if (source === null) return null;
    const prefix = name + '="';
    const at = source.indexOf(prefix);
    if (at < 0) return null;
    const end = source.indexOf(
        '"', at + prefix.length,
    );
    if (end < 0) return null;
    return source.slice(at + prefix.length, end);
}

// The refresh cookie the door set, from the answer's
// set-cookie lines (one per cookie, joined as a query
// reads them), or '' when it set none.
export function refreshFromHeaders(
    answered: HttpMessage,
): string {
    const cookies = answered.query('header.set-cookie');
    const raw = cookies.exists() ? cookies.toText() : '';
    const match = /(?:^|[\n,])\s*refresh_token=([^;\n]+)/
        .exec(raw);
    const value = match?.[1];
    return value === undefined ? '' : value.trim();
}

export function refusedDoor(
    answered: HttpMessage,
): Error | null {
    const status = answered.query('status').toNumber();
    if (status >= 200 && status < 300) {
        return null;
    }
    let error = 'request failed';
    if (answered.body().exists()) {
        const content = answered.body().toValue() as {
            error?: unknown,
        };
        if (typeof content.error === 'string') {
            error = content.error;
        }
    }
    if (status === 401) {
        return new UnauthorizedError(error);
    }
    return new RequestError(
        error + ' ()', status,
    );
}

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
// The HMAC key lives on the server. This adapter only
// drives authorize + token over the fetch facade.
export async function postPasswordLogin(
    ctx: RequestContext,
    username: string,
    password: string,
): Promise<SessionCredentials | null> {
    const verifier = generateSecret();
    const challenge = bytesToBase64Url(
        await sha256Bytes(verifier),
    );
    const authorized = await ctx.POSTUnauthenticated(
        'authentication/authorize', {
            method: 'password',
            client_id: WEB_CLIENT_ID,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        },
        [[
            'authorization',
            basicAuthorization(username, password),
        ]],
    );
    const authorizeRefusal = refusedDoor(authorized);
    if (authorizeRefusal instanceof UnauthorizedError) {
        return null;
    }
    if (authorizeRefusal !== null) throw authorizeRefusal;
    const code = authParam(authorized, 'code');
    if (code === null) {
        throw new Error(
            'authentication-info lacks code',
        );
    }
    const granted = await ctx.POSTUnauthenticated(
        'authentication/token', {
            grant_type: 'authorization_code',
            client_id: WEB_CLIENT_ID,
        },
        [[
            'authorization',
            basicAuthorization(code, verifier),
        ]],
    );
    const grantRefusal = refusedDoor(granted);
    if (grantRefusal instanceof UnauthorizedError) {
        return null;
    }
    if (grantRefusal !== null) throw grantRefusal;
    const accessToken = authParam(granted, 'access_token');
    if (accessToken === null) {
        throw new Error(
            'authentication-info lacks access_token',
        );
    }
    return {
        accessToken,
        refreshToken: ctx.session.isCookieSession()
            ? ''
            : refreshFromHeaders(granted),
    };
}
