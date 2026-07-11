// @ts-expect-error — Node global stub
globalThis.localStorage = (() => {
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
})();

// Minimal DOM stubs so redirectToLogin (getPageName reads
// data-page; navigateTo sets window.location.href) runs in Node.
// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
// @ts-expect-error — Node global stub
globalThis.document = {
    documentElement: { getAttribute: () => 'dashboard' },
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, UnauthorizedError } from '../api/api.ts';
import {
    createRecoveringRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { putSessionToken } from '../web-app/app/adapters/init.ts';
import {
    getSessionCredentials,
    putSessionCredentials,
} from '../web-app/app/adapters/session-credentials.ts';
import { STORAGE_KEY_AUTHORIZATION } from
    '../web-app/app/storage-keys.ts';
import {
    ideaBody, organizationRow, seedAdminSchema,
    seedOrganizationDocument as seedOrganizationDocumentPair,
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
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    appendMessagePair, formAuthPair, formWritePair,
} from '../api/message-pair.ts';
import type { AuthPairSeed } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    deriveIdentityTokens,
} from '../api/derive-identity-tokens.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Below-facade pair formation, mirroring authorizePassword's OWN
// storage effect (Phase 13 Task 7, Gate 3): grantAuthorizationCode
// 's pre-tx lookup scans the '/authentication/authorize/' response
// family for a stored pair whose (redacted) `code` field
// fingerprints to the presented code, so a bare pair — the SAME
// shape a real login forms (Phase 13 Task 9: the authorization_
// codes row half retired) — is all a seed needs.
async function seedAuthorizationCodePair(
    db: MemoryDbAdapter,
    code: string,
): Promise<void> {
    const seed: AuthPairSeed = {
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
    const pair = await formAuthPair(
        seed, requestBody, 'current', 200, { code },
    );
    await appendMessagePair(db, pair);
}

async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodePair(db, 'the-code');
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
    return res.json();
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// the recovery/re-scope paths below authorize through
// role_grants/memberships once they derive from the pair plane,
// so a raw row here would go derivation-invisible. Every
// id/field value stays IDENTICAL to the raw puts these replace —
// only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/role-grants/' + id,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
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
    await seedOrganizationDocumentPair(
        db, organization, organization);
    await seedRoleGrantPair(db, 'role-current-' + organization, {
        organization_id: organization, identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await seedMembershipPair(db, 'm-current-' + organization, {
        organization_id: organization, identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
}

// The pair-plane counterpart of seedOrganizationAdmin's row-
// only grant/membership: a real PUT through the route so the
// org exists on BOTH planes. The flipped GET /organizations
// (Phase 12 Task 5) derives from the ledger, so the re-scope
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
                    'Bearer ' + await devToken('current'),
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
        sub: 'current', roles: [], name: 'Demo', organization,
        iat: 1_600_000_000, ttlSeconds: 1,
        jti: 'exp-org-' + organization,
    });
}

test('a recover context silently refreshes a dead access token',
async () => {
    localStorage.clear();
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
    const members = await ctx.GET('members');
    assert.ok(Array.isArray(members));
});

test('concurrent 401s share exactly one refresh grant',
async () => {
    localStorage.clear();
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
        ctx.GET('members'),
        ctx.GET('organizations'),
    ]);
    assert.ok(Array.isArray(members));
    assert.ok(Array.isArray(organizations));
    // exactly ONE rotation event: the refresh jti was spent once
    const rotations = (await deriveIdentityTokens(db))
        .filter(row => row.action === 'rotated');
    assert.equal(rotations.length, 1);
    // the session survived (nothing was branded reuse)
    assert.notEqual(getSessionCredentials(), null);
});

test('a live credential with an anonymous-seed holder re-scopes'
+ ' rather than scrubbing the session',
async () => {
    localStorage.clear();
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
    const members = await ctx.GET('members');
    assert.ok(Array.isArray(members));
    // the live session is preserved (not scrubbed) and now scoped
    assert.notEqual(getSessionCredentials(), null);
    assert.notEqual(getSessionToken(), seed);
});

test('recovery with both tokens dead scrubs and bounces',
async () => {
    localStorage.clear();
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
    await assert.rejects(
        () => ctx.GET('members'), UnauthorizedError);
    // the dead credential was scrubbed...
    assert.equal(getSessionCredentials(), null);
    // ...and the tab was redirected to the login page
    assert.match(
        window.location.href, /auth.*return=dashboard/);
});

// Corrupt credential is unrecoverable: scrub + bounce, and
// the catch must leave a warn (empty catch destroys evidence).
test('recovery with a corrupt credential scrubs, bounces,'
+ ' and warns',
async () => {
    localStorage.clear();
    window.location.href = '';
    const db = await freshDb();
    localStorage.setItem(
        STORAGE_KEY_AUTHORIZATION, 'not json at all');
    const dead = await expiredToken();
    putSessionToken(dead);
    const warns: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
        warns.push(args);
    };
    try {
        const ctx = createRecoveringRequestContext(
            db, dead);
        await assert.rejects(
            () => ctx.GET('members'), UnauthorizedError);
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(
        localStorage.getItem(STORAGE_KEY_AUTHORIZATION),
        null);
    assert.match(
        window.location.href, /auth.*return=dashboard/);
    assert.ok(
        warns.some(args =>
            args.includes('corrupt session credential')),
        'corrupt credential must log.warn, not silent catch',
    );
});

test('a recovering context reads through the vessel token,'
+ ' not a concurrently-moved global', async () => {
    localStorage.clear();
    const db = await freshDb();
    await seedOrganizationAdmin(db, 'A');
    await seedOrganizationAdmin(db, 'B');
    const aToken = await organizationToken('current', 'A');
    const ctx = createRecoveringRequestContext(db, aToken);
    // Seeded through the live document PUT so a1's message
    // pair exists — GET ideas derives from the ledger. No
    // foreign b1 seed: ideas table retired (Phase Final Stage
    // B); vessel A-only visibility is proven by a1 alone.
    const { organization_id: _organizationId, ...a1Fields } =
        ideaBody('A', 'mine');
    await ctx.PUT('ideas/a1', {
        ...a1Fields,
        state: 'active',
        state_at: '2026-01-01T00:00:00.000000Z',
        state_event_id: 'ev-a1',
    });
    // another tab moves the shared session holder to org B
    putSessionToken(await organizationToken('current', 'B'));
    const rows = await ctx.GET<{ id: string }[]>('ideas');
    // the read ran in the vessel's org A, not the global's B
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('recovery re-scopes to the vessel org claim, not the'
+ ' cross-tab preference', async () => {
    localStorage.clear();
    const db = await freshDb();
    await seedOrganizationAdmin(db, 'A');
    await seedOrganizationAdmin(db, 'B');
    // the enumerate joins derived org documents to memberships,
    // so both orgs must exist on the pair plane to land in the
    // reachable set (seedOrganizationDocument's own comment)
    await seedOrganizationDocument(db, 'A');
    await seedOrganizationDocument(db, 'B');
    const pair = await issuePair(db);
    // the dying request was scoped to org A: its access token
    // has expired but the refresh is still live
    const deadA = await expiredOrganizationToken('A');
    putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    putSessionToken(deadA);
    // another tab last selected org B (the cross-tab preference)
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, 'B');
    const ctx = createRecoveringRequestContext(db, deadA);
    // the 401 drives refresh + re-scope; recovery must honor the
    // vessel's own org A, never the preference another tab wrote
    await ctx.GET('ideas');
    const scoped =
        principalFromToken(getSessionToken()).organization;
    // one vessel truth: the recovered session matches the
    // identity the request carried, and that is org A
    assert.equal(scoped, ctx.identity.organization);
    assert.equal(scoped, 'A');
});

test('recovery leaves the cross-tab active-org preference'
+ ' untouched', async () => {
    localStorage.clear();
    const db = await freshDb();
    await seedOrganizationAdmin(db, 'A');
    await seedOrganizationAdmin(db, 'B');
    await seedOrganizationDocument(db, 'A');
    await seedOrganizationDocument(db, 'B');
    const pair = await issuePair(db);
    const deadA = await expiredOrganizationToken('A');
    putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    putSessionToken(deadA);
    // the foreground tab is viewing org B
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, 'B');
    const ctx = createRecoveringRequestContext(db, deadA);
    await ctx.GET('ideas');
    // the background recovery scopes ITS session to vessel org A...
    assert.equal(
        principalFromToken(getSessionToken()).organization, 'A');
    // ...but never clobbers the foreground tab's chosen org
    assert.equal(localStorage.getItem(ACTIVE_ORGANIZATION_ID), 'B');
});
