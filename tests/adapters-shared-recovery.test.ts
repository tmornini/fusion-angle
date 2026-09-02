// Minimal DOM stubs so redirectToLogin (getPageName reads
// data-page; navigateTo sets window.location.href) runs in Node.
// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
globalThis.document = {
    documentElement: { getAttribute: () => 'dashboard' },
} as unknown as Document;

import {
    assert,
    assertEquals,
    assertMatch,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, UnauthorizedError } from '../api/api.ts';
import {
    createRecoveringRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { captureConsole } from './fixtures/console-capture.ts';
import {
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
import { putSessionToken } from '../web-app/app/adapters/init.ts';
import {
    getSessionCredentials,
    putSessionCredentials,
} from '../web-app/app/adapters/session-credentials.ts';
import { STORAGE_KEY_AUTHORIZATION } from
    '../web-app/app/storage-keys.ts';
import {
    ideaBody, organizationRow, seedAdminSchema,
    seedOrganizationDocument as seedOrganizationDocumentMessagePair,
} from './test-fixtures.ts';
import {
    devToken, expiredToken, organizationToken,
} from './token-fixtures.ts';
import {
    ANONYMOUS_ID,
    mintAccessToken,
    TOKEN_AUDIENCE,
    principalFromToken,
} from '../api/access-token.ts';
import {
    ACTIVE_ORGANIZATION_ID,
} from '../web-app/app/adapters/organization-session.ts';
import {
    getSessionToken,
} from '../web-app/app/adapters/init.ts';
import {
    putMessagePair, formAuthMessagePair,
} from '../api/message-pair.ts';
import type { AuthMessagePairSeed } from '../api/message-pair.ts';
import { nowUtc } from '../api/types.ts';
import {
    deriveIdentityTokens,
} from '../api/derive-identity-tokens.ts';
import { refreshTokenFromSetCookie } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { deleteRefreshChannel } from
    '../web-app/app/adapters/session-refresh-mutex.ts';

// The single-flight mutex opens ONE refresh channel per
// process, lazily, and a test process has no unload to
// reclaim it. Release after each test, so the handle never
// outlives the test that opened it; the next refresh
// reopens it.
Deno.test.afterEach(() => {
    deleteRefreshChannel();
});

const ORGANIZATION_A = generateIdentifier();
const ORGANIZATION_B = generateIdentifier();

const BASE = 'http://localhost';

// A fresh Map-backed fake per test — bodies below call
// localStorage.getItem/setItem directly; clear() is the
// fake's own reset, which no body calls.
function freshStorage(): Partial<Storage> {
    const store = new Map<string, string>();
    return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
            store.set(k, v);
        },
        removeItem: (k: string) => {
            store.delete(k);
        },
        clear: () => {
            store.clear();
        },
        key: () => null,
        get length() {
            return store.size;
        },
    };
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Below-facade pair formation, mirroring authorizePassword's OWN
// storage effect (Phase 13 Task 7, Gate 3): grantAuthorizationCode
// 's pre-tx lookup reads by body containment the
// '/authentication/authorize/' response
// family for a stored pair whose `code` field equals the presented
// code, so a bare pair — the SAME shape a real login forms
// (Phase 13 Task 9: the authorization_codes row half retired) —
// is all a seed needs.
async function seedAuthorizationCodeMessagePair(
    db: MemoryDbAdapter,
    code: string,
): Promise<void> {
    const seed: AuthMessagePairSeed = {
        requestAt: nowUtc(),
        headerFields: [],
        method: 'POST',
        pathname: '/authentication/authorize',
        routePattern: 'authentication/authorize',
        routeSegments: ['authentication', 'authorize'],
        pathSegments: ['authentication', 'authorize'],
    };
    const requestBody = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: 'web',
    };
    const messagePair = await formAuthMessagePair(
        seed, requestBody, 'XXZruirZyAOoRpNxaDnpSA', 200, { code },
    );
    await putMessagePair(db, messagePair);
}

async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodeMessagePair(db, 'the-code');
    const res = await handleRequest(db, new Request(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: 'the-code',
                client_id: 'web',
            }),
        }));
    const body = await res.json() as { access_token: string };
    return {
        access_token: body.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the recovery/re-scope paths below authorize through
// role_grants/memberships once they derive from the message plane,
// so a raw row here would go derivation-invisible. Every
// id/field value stays IDENTICAL to the raw puts these replace —
// only the write mechanism changes.
async function seedMembershipMessagePair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );
}

// Authorize `current` as admin of `org` and stamp the
// membership the gate fences on — the per-org grant the
// facade reads (mirrors api-org-isolation's twoOrganizations).
async function seedOrganizationAdmin(
    db: MemoryDbAdapter, organization: string,
): Promise<void> {
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; idempotent — a no-op on a repeat
    // organization id, so this file's own separate
    // seedOrganizationDocument calls below stay harmless) —
    // deriveMembershipsForIdentity's own enumerate-then-probe (via
    // deriveOrganizations) needs `organization` to already be
    // derivable before the role-grant/membership pairs below can
    // resolve.
    await seedOrganizationDocumentMessagePair(
        db, organization, organization);
    await seedMembershipMessagePair(db, generateIdentifier(), {
        organization_id: organization, identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2026-06-04T00:00:00.000000Z',
    });
}

// The message-plane counterpart of seedOrganizationAdmin's row-
// only grant/membership: a real PUT through the route so the
// org exists on BOTH planes. GET
// /identities/:id/organizations/ derives from the
// ledger, so the re-scope
// read below needs this, not a raw db.organizations.put — the
// admin role seedOrganizationAdmin already grants `current` in
// `organization` authorizes the write.
async function seedOrganizationDocument(
    db: MemoryDbAdapter, organization: string,
): Promise<void> {
    await handleRequest(db, new Request(
        `${BASE}/organizations/${organization}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization':
                    'Bearer ' + await devToken('XXZruirZyAOoRpNxaDnpSA'),
            },
            body: JSON.stringify(organizationRow(organization)),
        }));
}

// A dead access token already scoped to `org` — the vessel an
// org-bound request carries when its session expires mid-flight.
async function expiredOrganizationToken(
    organization: string,
): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'XXZruirZyAOoRpNxaDnpSA', roles: [], name: 'Demo', organization,
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: generateIdentifier(),
    });
}

Deno.test('a recover context silently refreshes a dead access token',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const deadAccess = await expiredToken();
    // the session holds a dead access token but a live refresh
    putSessionCredentials({
        accessToken: deadAccess,
        refreshToken: pair.refresh_token,
    });
    putSessionToken(deadAccess);
    const ctx = createRecoveringRequestContext(
        db, deadAccess);
    // the 401 triggers refresh + org re-scope + one retry
    const members = await ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
        + 'members/');
    assert(Array.isArray(members));
}));

Deno.test('concurrent 401s share exactly one refresh grant',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const deadAccess = await expiredToken();
    putSessionCredentials({
        accessToken: deadAccess,
        refreshToken: pair.refresh_token,
    });
    putSessionToken(deadAccess);
    const ctx = createRecoveringRequestContext(
        db, deadAccess);
    // both reads 401 in parallel; a second refresh would be
    // branded reuse and revoke the fresh chain
    const [members, organizations] = await Promise.all([
        ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/members/'),
        ctx.GET('identities/XXZruirZyAOoRpNxaDnpSA/organizations/'),
    ]);
    assert(Array.isArray(members));
    assert(Array.isArray(organizations));
    // exactly ONE rotation event: the refresh jti was spent once
    const rotations = (await deriveIdentityTokens(db))
        .filter(row => row.action === 'rotated');
    assertStrictEquals(rotations.length, 1);
    // the session survived (nothing was branded reuse)
    assertNotStrictEquals(getSessionCredentials(), null);
}));

Deno.test('a live credential with an anonymous-seed holder re-scopes'
+ ' rather than scrubbing the session',
() => withLocalStorageAsync(freshStorage(), async () => {
    window.location.href = '';
    const db = await freshDb();
    const pair = await issuePair(db);
    // the persisted credential is live, but the per-tab holder is
    // still the anonymous seed (an org-bound read ran before boot
    // scoped the session) — the read 401s 'anonymous principal'
    putSessionCredentials({
        accessToken: pair.access_token,
        refreshToken: pair.refresh_token,
    });
    const seed = await devToken(ANONYMOUS_ID);
    putSessionToken(seed);
    const ctx = createRecoveringRequestContext(
        db, seed);
    // recovery re-installs the live token, re-scopes, and retries
    const members = await ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
        + 'members/');
    assert(Array.isArray(members));
    // the live session is preserved (not scrubbed) and now scoped
    assertNotStrictEquals(getSessionCredentials(), null);
    assertNotStrictEquals(getSessionToken(), seed);
}));

Deno.test('recovery with both tokens dead scrubs and bounces',
() => withLocalStorageAsync(freshStorage(), async () => {
    window.location.href = '';
    const db = await freshDb();
    // both tokens dead → the resolver says login, not refresh
    const dead = await expiredToken();
    putSessionCredentials({
        accessToken: dead, refreshToken: dead,
    });
    putSessionToken(dead);
    const ctx = createRecoveringRequestContext(
        db, dead);
    // the 401 is unrecoverable: the original error propagates
    await assertRejects(
        () => ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/members/')
            , UnauthorizedError);
    // the dead credential was scrubbed...
    assertStrictEquals(getSessionCredentials(), null);
    // ...and the tab was redirected to the login page
    assertMatch(
        window.location.href, /auth.*return=dashboard/);
}));

// Corrupt credential is unrecoverable: scrub + bounce, and
// the catch must leave a warn (empty catch destroys evidence).
Deno.test('recovery with a corrupt credential scrubs, bounces,'
+ ' and warns',
() => withLocalStorageAsync(freshStorage(), async () => {
    window.location.href = '';
    const db = await freshDb();
    localStorage.setItem(
        STORAGE_KEY_AUTHORIZATION, 'not json at all');
    const dead = await expiredToken();
    putSessionToken(dead);
    const { calls: warns } = await captureConsole(
        'warn',
        async () => {
            const ctx = createRecoveringRequestContext(
                db, dead);
            await assertRejects(
                () => ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                    + ''), UnauthorizedError);
        },
    );
    assertStrictEquals(
        localStorage.getItem(STORAGE_KEY_AUTHORIZATION),
        null);
    assertMatch(
        window.location.href, /auth.*return=dashboard/);
    assert(
        warns.some(args =>
            args.includes('corrupt session credential')),
        'corrupt credential must log.warn, not silent catch',
    );
}));

Deno.test('a recovering context reads through the vessel token,'
+ ' not a concurrently-moved global',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    await seedOrganizationAdmin(db, ORGANIZATION_A);
    await seedOrganizationAdmin(db, ORGANIZATION_B);
    const aToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const ctx = createRecoveringRequestContext(db, aToken);
    // Seeded through the live document PUT so UQTJZvCoKlFjEoDlDUwekw's
    // message
    // pair exists — GET ideas derives from the ledger. No
    // foreign b1 seed: ideas table retired (Phase Final Stage
    // B); vessel A-only visibility is proven by UQTJZvCoKlFjEoDlDUwekw alone.
    const { organization_id: _organizationId, ...a1Fields } =
        ideaBody(ORGANIZATION_A, 'mine');
    await ctx.PUT(
        'organizations/' + ORGANIZATION_A
            + '/ideas/UQTJZvCoKlFjEoDlDUwekw',
        {
        ...a1Fields,
        state: 'active',
    });
    // another tab moves the shared session holder to org B
    putSessionToken(await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_B,
    ));
    const rows = await ctx.GET<{ id: string }[]>(
        'organizations/' + ORGANIZATION_A + '/ideas/',
    );
    // the read ran in the vessel's org A, not the global's B
    assertEquals(rows.map(r => r.id), ['UQTJZvCoKlFjEoDlDUwekw']);
}));

Deno.test('recovery re-scopes to the vessel org claim, not the'
+ ' cross-tab preference',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    await seedOrganizationAdmin(db, ORGANIZATION_A);
    await seedOrganizationAdmin(db, ORGANIZATION_B);
    // the enumerate joins derived org documents to memberships,
    // so both orgs must exist on the message plane to land in the
    // reachable set (seedOrganizationDocument's own comment)
    await seedOrganizationDocument(db, ORGANIZATION_A);
    await seedOrganizationDocument(db, ORGANIZATION_B);
    const pair = await issuePair(db);
    // the dying request was scoped to org A: its access token
    // has expired but the refresh is still live
    const deadA = await expiredOrganizationToken(ORGANIZATION_A);
    putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    putSessionToken(deadA);
    // another tab last selected org B (the cross-tab preference)
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, ORGANIZATION_B);
    const ctx = createRecoveringRequestContext(db, deadA);
    // the 401 drives refresh + re-scope; recovery must honor the
    // vessel's own org A, never the preference another tab wrote
    await ctx.GET('organizations/' + ORGANIZATION_A + '/ideas/');
    const scoped =
        principalFromToken(getSessionToken()).organization;
    // one vessel truth: the recovered session matches the
    // identity the request carried, and that is org A
    assertStrictEquals(scoped, ctx.identity.organization);
    assertStrictEquals(scoped, ORGANIZATION_A);
}));

Deno.test('recovery leaves the cross-tab active-org preference'
+ ' untouched', () => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    await seedOrganizationAdmin(db, ORGANIZATION_A);
    await seedOrganizationAdmin(db, ORGANIZATION_B);
    await seedOrganizationDocument(db, ORGANIZATION_A);
    await seedOrganizationDocument(db, ORGANIZATION_B);
    const pair = await issuePair(db);
    const deadA = await expiredOrganizationToken(ORGANIZATION_A);
    putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    putSessionToken(deadA);
    // the foreground tab is viewing org B
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, ORGANIZATION_B);
    const ctx = createRecoveringRequestContext(db, deadA);
    await ctx.GET('organizations/' + ORGANIZATION_A + '/ideas/');
    // the background recovery scopes ITS session to vessel org A...
    assertStrictEquals(
        principalFromToken(getSessionToken()).organization, ORGANIZATION_A);
    // ...but never clobbers the foreground tab's chosen org
    assertStrictEquals(
        localStorage.getItem(ACTIVE_ORGANIZATION_ID), ORGANIZATION_B,
    );
}));
