import {
    indexedDbAdapter,
} from '../../../api/db-indexeddb.ts';
import {
    postNotificationEvent,
} from './broadcast-channel.ts';
import type {
    ClientFacadeAdapter,
} from '../../../api/api.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    principalFromToken,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    nowEpochSeconds,
} from '../../../api/types.ts';

let adapter: ClientFacadeAdapter | undefined;

// The persistence tier: a real IndexedDB transaction per op,
// O(1) appends, and cross-tab refresh via the posted
// notification events. The connection opens in initialize().
// Production boot passes this; boot-path tests substitute an
// in-memory tier — IndexedDB has no Node stub, and we add no
// fake.
export function defaultAdapter(): ClientFacadeAdapter {
    return indexedDbAdapter(postNotificationEvent);
}

export async function initAdapter(
    makeAdapter: () => ClientFacadeAdapter,
): Promise<boolean> {
    await postSessionSeed();
    adapter = makeAdapter();
    await adapter.initialize();
    // The composition root probes the datastore directly —
    // the same infrastructure tier as initialize() above.
    // Exporting the whole database through the snapshot plane
    // just to compare it against null was never the question
    // being asked.
    return adapter.hasSchema();
}

export function getDbAdapter(): ClientFacadeAdapter {
    if (!adapter) {
        throw new Error(
            'initAdapter() not called.',
        );
    }
    return adapter;
}

const SESSION_TTL_SECONDS = 15 * 60;

let sessionToken: string | undefined;

async function mintSessionToken(
    sub: string,
    name: string,
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub,
        roles: [],
        name,
        iat: nowEpochSeconds(),
        ttlSeconds: SESSION_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
    });
}

export function putSessionToken(token: string): void {
    sessionToken = token;
}

export function deleteSessionToken(): void {
    sessionToken = undefined;
}

// Pre-seed the per-tab holder with the anonymous default.
// Minting is async (real HMAC signing), so a sync getter
// cannot mint lazily; the boot path awaits this before any
// getSessionToken() call. Idempotent: a holder already set
// (anonymous or an established subject) is left untouched.
export async function postSessionSeed(): Promise<void> {
    if (sessionToken === undefined) {
        sessionToken = await mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        );
    }
}

// True once postSessionSeed() (or putSessionToken()) has set a
// holder. Non-throwing — the one caller allowed to run before
// boot completes (a cross-tab subscriber woken by another tab's
// write while THIS tab is still initializing) checks this
// before any principalFromToken(getSessionToken()) read, since
// every predicate below throws on an unseeded holder.
export function sessionTokenIsSeeded(): boolean {
    return sessionToken !== undefined;
}

// Returns the already-minted per-tab token. postSessionSeed
// (boot) must have seeded it; the boot gate / login / recovery
// then REPLACE it via putSessionToken. An unseeded holder is a
// boot-order bug, not a state to mask — crash with a clear
// message rather than return a wrong token.
export function getSessionToken(): string {
    if (sessionToken === undefined) {
        throw new Error(
            'session token uninitialized;'
            + ' await postSessionSeed() first',
        );
    }
    return sessionToken;
}

// True only when the held token carries an `org` claim — the
// post-exchange, org-scoped session. The anonymous seed and an
// un-exchanged flat token both read false, so org-bound surfaces
// (the sidebar member chip, the command palette index) can gate
// their reads on a real scoped session instead of firing them on
// a seed and surfacing a 'no active org' / anonymous-principal 401.
export function sessionIsOrganizationScoped(): boolean {
    return principalFromToken(getSessionToken()).organization
        !== undefined;
}

// True when the held token's identity can reach at least one org.
// A freshly minted (flat) login token carries the reachable set
// before org-scoping; an identity with zero memberships reads
// false, so login and boot can land it on invitations instead of
// an org-scoped dead end.
export function sessionHasReachableOrganization(): boolean {
    const organizations =
        principalFromToken(getSessionToken()).organizations;
    return organizations !== undefined && organizations.length > 0;
}

// True when the held token belongs to a logged-in identity rather
// than the anonymous seed. Identity-scoped sidebar widgets (the
// member chip name, the invitations bell) render for any logged-in
// visitor — including a zero-membership identity on its invitations
// page — while org-bound widgets still gate on sessionIsOrganizationScoped.
export function sessionIsAuthenticated(): boolean {
    return principalFromToken(getSessionToken()).id
        !== ANONYMOUS_ID;
}
