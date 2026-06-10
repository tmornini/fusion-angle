import {
    IndexedDbDbAdapter,
} from '../../../api/db-indexeddb.ts';
import {
    postTablesChanged,
} from './broadcast-channel.ts';
import type { DbAdapter } from '../../../api/db.ts';
import {
    mintAccessToken,
    principalFromToken,
    ANONYMOUS_ID,
} from '../../../api/access-token.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';

let adapter: DbAdapter | undefined;

// The persistence tier: a real IndexedDB transaction per op,
// O(1) appends, and cross-tab refresh via the posted table
// names. The connection opens in initialize().
function defaultAdapter(): DbAdapter {
    return new IndexedDbDbAdapter(postTablesChanged);
}

// `makeAdapter` is injectable so boot-path tests can
// substitute an in-memory tier — IndexedDB has no Node stub,
// and we add no fake. Production passes nothing.
export async function initAdapter(
    makeAdapter: () => DbAdapter = defaultAdapter,
): Promise<boolean> {
    await ensureSessionToken();
    adapter = makeAdapter();
    await adapter.initialize();
    // The composition root probes the datastore directly —
    // the same infrastructure tier as initialize() above.
    // The HTTP snapshot plane is bearer-closed once a schema
    // exists, and exporting the whole database to compare it
    // against null was never the question being asked.
    return adapter.hasSchema();
}

export function getDbAdapter(): DbAdapter {
    if (!adapter) {
        throw new Error(
            'initAdapter() not called.',
        );
    }
    return adapter;
}

const SESSION_TTL_SECONDS = 15 * 60;

let sessionToken: string | undefined;

function nowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

async function mintSessionToken(
    sub: string,
    name: string,
): Promise<string> {
    return mintAccessToken({
        sub,
        roles: [],
        name,
        iat: nowSeconds(),
        ttlSeconds: SESSION_TTL_SECONDS,
        jti: generateCryptoSafeBase62(),
    });
}

export function setSessionToken(token: string): void {
    sessionToken = token;
}

export function clearSessionToken(): void {
    sessionToken = undefined;
}

// Pre-seed the per-tab holder with the anonymous default.
// Minting is async (real HMAC signing), so a sync getter
// cannot mint lazily; the boot path awaits this before any
// getSessionToken() call. Idempotent: a holder already set
// (anonymous or an established subject) is left untouched.
export async function ensureSessionToken(): Promise<void> {
    if (sessionToken === undefined) {
        sessionToken = await mintSessionToken(
            ANONYMOUS_ID, 'Anonymous',
        );
    }
}

// Returns the already-minted per-tab token. ensureSessionToken
// (boot) must have seeded it; the boot gate / login / recovery
// then REPLACE it via setSessionToken. An unseeded holder is a
// boot-order bug, not a state to mask — crash with a clear
// message rather than return a wrong token.
export function getSessionToken(): string {
    if (sessionToken === undefined) {
        throw new Error(
            'session token uninitialized;'
            + ' await ensureSessionToken() first',
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
export function sessionIsOrgScoped(): boolean {
    return principalFromToken(getSessionToken()).organization
        !== undefined;
}

// True when the held token's identity can reach at least one org.
// A freshly minted (flat) login token carries the reachable set
// before org-scoping; an identity with zero memberships reads
// false, so login and boot can land it on invitations instead of
// an org-scoped dead end.
export function sessionHasReachableOrg(): boolean {
    const orgs =
        principalFromToken(getSessionToken()).organizations;
    return orgs !== undefined && orgs.length > 0;
}
