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
import type { Client } from '../client/create-client.ts';
import { createAppClient } from '../web-app/app/client.ts';
import { inPageClient } from './in-page-facade.ts';
import { captureConsole } from './fixtures/console-capture.ts';
import {
    withLocalStorageAsync,
} from './fixtures/local-storage.ts';
import { STORAGE_KEY_AUTHORIZATION } from '../client/session-storage-keys.ts';
import {
    ideaBody, organizationRow, seedAdminSchema,
    seedOrganizationDocument as seedOrganizationDocumentMessagePair,
} from './test-fixtures.ts';
import {
    claimToken, devToken, expiredToken, organizationToken,
} from './token-fixtures.ts';
import {
    ANONYMOUS_ID,
    mintAccessToken,
    TOKEN_AUDIENCE,
    principalFromToken,
} from '../api/access-token.ts';
import {
    ACTIVE_ORGANIZATION_ID,
} from '../client/organization-session.ts';
import {
    runWrite,
    attemptFor,
    formAuthMessagePair,
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { OPERATION_ID_HEADER } from '../shared/message-id-fields.ts';
import type { HttpFacade } from
    '../client/http-facade.ts';
import type { AuthMessagePairSeed } from '../api/message-pair.ts';
import { nowUtc } from '../shared/types.ts';
import {
    deriveIdentityTokensFor,
} from '../api/derive-identity-tokens.ts';
import {
    apiRequest,
    framedRequest,
    presentedFields,
    refreshTokenFromSetCookie,
} from './http-fixtures.ts';
import { basicAuthorization } from
    '../api/authentication.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import {
    postInvitationAcceptance,
} from '../client/invitations.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { sha256Hex } from '../shared/digest.ts';
import { deleteNotificationChannel } from
    '../client/broadcast-channel.ts';

// Every client a test builds, so afterEach can release it.
const clients: Client[] = [];

// The single-flight mutex opens one refresh channel per
// client, lazily, but its fixed name still reaches every
// test file's worker in the process, and a test process
// has no unload to reclaim it. Release after each test, so
// the handle never outlives the test that opened it; the
// next refresh reopens it.
Deno.test.afterEach(() => {
    for (const client of clients.splice(0)) {
        client.deleteRefreshChannel();
    }
    deleteNotificationChannel();
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
        bodyBytes: new Uint8Array(),
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    };
    const requestBody = {
        method: 'password', username: 'seed@example.com',
        password: 'seed-password', client_id: 'web',
    };
    const messagePair = await formAuthMessagePair(
        {
            ...seed,
            bodyBytes: new TextEncoder().encode(
                JSON.stringify(requestBody),
            ),
        },
        requestBody, 'XXZruirZyAOoRpNxaDnpSA', undefined,
        seed.operationId, seed.requestId,
        [{
            name: 'authentication-info',
            value: 'code="' + code + '"',
        }],
    );
    const codeName = await sha256Hex(code);
    const codePair = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/authentication/authorization-codes/'
            + codeName,
        routePattern:
            'authentication/authorization-codes/:hash',
        routeSegments: [
            'authentication',
            'authorization-codes',
            ':hash',
        ],
        pathSegments: [
            'authentication',
            'authorization-codes',
            codeName,
        ],
        headerFields: [],
        body: undefined,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: seed.requestAt,
        organization: undefined,
        responseBody: { client_id: 'web' },
        operationId: seed.operationId,
        requestId: seed.requestId,
        genesis: true,
        emptyRequest: true,
    });
    await runWrite(
        db,
        attemptFor([codePair, messagePair]),
        [codePair, messagePair],
    );
}

async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodeMessagePair(db, 'the-code');
    const res = await handleRequest(db, framedRequest(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: basicAuthorization(
                    'the-code', '',
                ),
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: 'web',
            }),
        }));
    const body = await presentedFields(res) as {
        access_token: string;
    };
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
    await handleRequest(db, framedRequest(
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
    const client = inPageClient(db);
    clients.push(client);
    const pair = await issuePair(db);
    const deadAccess = await expiredToken();
    // the session holds a dead access token but a live refresh
    client.putSessionCredentials({
        accessToken: deadAccess,
        refreshToken: pair.refresh_token,
    });
    client.putSessionToken(deadAccess);
    const ctx = client.recoveringRequestContext(
        deadAccess);
    // the 401 triggers refresh + org re-scope + one retry
    const members = await ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
        + 'members/');
    assert(Array.isArray(members));
}));

Deno.test('concurrent 401s share exactly one refresh grant',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const client = inPageClient(db);
    clients.push(client);
    const pair = await issuePair(db);
    const deadAccess = await expiredToken();
    client.putSessionCredentials({
        accessToken: deadAccess,
        refreshToken: pair.refresh_token,
    });
    client.putSessionToken(deadAccess);
    const ctx = client.recoveringRequestContext(
        deadAccess);
    // both reads 401 in parallel; a second refresh would be
    // branded reuse and revoke the fresh chain
    const [members, organizations] = await Promise.all([
        ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/members/'),
        ctx.GET('identities/XXZruirZyAOoRpNxaDnpSA/organizations/'),
    ]);
    assert(Array.isArray(members));
    assert(Array.isArray(organizations));
    // exactly ONE rotation event: the refresh jti was spent once
    const rotations = (await deriveIdentityTokensFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    )).filter(row => row.action === 'rotated');
    assertStrictEquals(rotations.length, 1);
    // the session survived (nothing was branded reuse)
    assertNotStrictEquals(client.getSessionCredentials(), null);
}));

Deno.test('a live credential with an anonymous-seed holder re-scopes'
+ ' rather than scrubbing the session',
() => withLocalStorageAsync(freshStorage(), async () => {
    window.location.href = '';
    const db = await freshDb();
    const client = inPageClient(db);
    clients.push(client);
    const pair = await issuePair(db);
    // the persisted credential is live, but the per-tab holder is
    // still the anonymous seed (an org-bound read ran before boot
    // scoped the session) — the read 401s 'anonymous principal'
    client.putSessionCredentials({
        accessToken: pair.access_token,
        refreshToken: pair.refresh_token,
    });
    const seed = await devToken(ANONYMOUS_ID);
    client.putSessionToken(seed);
    const ctx = client.recoveringRequestContext(
        seed);
    // recovery re-installs the live token, re-scopes, and retries
    const members = await ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
        + 'members/');
    assert(Array.isArray(members));
    // the live session is preserved (not scrubbed) and now scoped
    assertNotStrictEquals(client.getSessionCredentials(), null);
    assertNotStrictEquals(client.getSessionToken(), seed);
}));

Deno.test('recovery with both tokens dead scrubs and bounces',
() => withLocalStorageAsync(freshStorage(), async () => {
    window.location.href = '';
    const db = await freshDb();
    const client = inPageClient(db);
    clients.push(client);
    // both tokens dead → the resolver says login, not refresh
    const dead = await expiredToken();
    client.putSessionCredentials({
        accessToken: dead, refreshToken: dead,
    });
    client.putSessionToken(dead);
    const ctx = client.recoveringRequestContext(
        dead);
    // the 401 is unrecoverable: the original error propagates
    await assertRejects(
        () => ctx.GET('organizations/AjdvjuECVZEgZoFajaIEkg/members/')
            , UnauthorizedError);
    // the dead credential was scrubbed...
    assertStrictEquals(client.getSessionCredentials(), null);
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
    const client = inPageClient(db);
    clients.push(client);
    localStorage.setItem(
        STORAGE_KEY_AUTHORIZATION, 'not json at all');
    const dead = await expiredToken();
    client.putSessionToken(dead);
    const { calls: warns } = await captureConsole(
        'warn',
        async () => {
            const ctx = client.recoveringRequestContext(
                dead);
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
    const client = inPageClient(db);
    clients.push(client);
    await seedOrganizationAdmin(db, ORGANIZATION_A);
    await seedOrganizationAdmin(db, ORGANIZATION_B);
    const aToken = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
    );
    const ctx = client.recoveringRequestContext(aToken);
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
    client.putSessionToken(await organizationToken(
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
    const client = inPageClient(db);
    clients.push(client);
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
    client.putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    client.putSessionToken(deadA);
    // another tab last selected org B (the cross-tab preference)
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, ORGANIZATION_B);
    const ctx = client.recoveringRequestContext(deadA);
    // the 401 drives refresh + re-scope; recovery must honor the
    // vessel's own org A, never the preference another tab wrote
    await ctx.GET('organizations/' + ORGANIZATION_A + '/ideas/');
    const scoped =
        principalFromToken(client.getSessionToken()).organization;
    // one vessel truth: the recovered session matches the
    // identity the request carried, and that is org A
    assertStrictEquals(scoped, ctx.identity.organization);
    assertStrictEquals(scoped, ORGANIZATION_A);
}));

Deno.test('recovery leaves the cross-tab active-org preference'
+ ' untouched', () => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const client = inPageClient(db);
    clients.push(client);
    await seedOrganizationAdmin(db, ORGANIZATION_A);
    await seedOrganizationAdmin(db, ORGANIZATION_B);
    await seedOrganizationDocument(db, ORGANIZATION_A);
    await seedOrganizationDocument(db, ORGANIZATION_B);
    const pair = await issuePair(db);
    const deadA = await expiredOrganizationToken(ORGANIZATION_A);
    client.putSessionCredentials({
        accessToken: deadA, refreshToken: pair.refresh_token,
    });
    client.putSessionToken(deadA);
    // the foreground tab is viewing org B
    localStorage.setItem(ACTIVE_ORGANIZATION_ID, ORGANIZATION_B);
    const ctx = client.recoveringRequestContext(deadA);
    await ctx.GET('organizations/' + ORGANIZATION_A + '/ideas/');
    // the background recovery scopes ITS session to vessel org A...
    assertStrictEquals(
        principalFromToken(client.getSessionToken()).organization,
        ORGANIZATION_A);
    // ...but never clobbers the foreground tab's chosen org
    assertStrictEquals(
        localStorage.getItem(ACTIVE_ORGANIZATION_ID), ORGANIZATION_B,
    );
}));

// Two recovering contexts race: a reader whose access token
// is dead (its 401 opens the facade refresh) and an acceptor
// whose token is live (its remint follows). Both would once
// present the same refresh jti; the loser was a replay and
// the chain was revoked. The remint now follows the flight.
Deno.test('a concurrent facade refresh and remint present'
+ ' one jti each',
() => withLocalStorageAsync(freshStorage(), async () => {
    const db = await freshDb();
    const client = inPageClient(db);
    clients.push(client);
    const wayneAdmin = 'toccYYkLEABmlbpHJalgtQ';
    await seedOrganizationDocumentMessagePair(
        db, ORGANIZATION_B, ORGANIZATION_B,
    );
    await seedSeat(
        db, ORGANIZATION_B, wayneAdmin, 'admin',
        '2026-06-04T00:00:00.000000Z',
    );
    await seedPersonIdentity(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Tony', email: 'demo@example.com',
        phone: '', bio: '',
    });
    const invitationId = generateIdentifier();
    const granted = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + ORGANIZATION_B
            + '/invitations/',
        token: await claimToken({
            sub: wayneAdmin,
            organization: ORGANIZATION_B,
            organizations: [ORGANIZATION_B],
            roles: ['admin:' + ORGANIZATION_B],
        }),
        body: {
            email: 'demo@example.com',
            invitationId,
            grantEventId: generateIdentifier(),
            grantAt: '2026-06-04T00:00:01.000000Z',
        },
    }));
    assertStrictEquals(granted.status, 200);
    const pair = await issuePair(db);
    client.putSessionCredentials({
        accessToken: pair.access_token,
        refreshToken: pair.refresh_token,
    });
    const deadA = await expiredOrganizationToken(ORGANIZATION_A);
    client.putSessionToken(deadA);
    const reader = client.recoveringRequestContext(deadA);
    const acceptor = client.recoveringRequestContext(
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_A,
        ),
    );
    const [members] = await Promise.all([
        reader.GET('organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'members/'),
        postInvitationAcceptance(
            acceptor, invitationId, ORGANIZATION_B,
        ),
    ]);
    assert(Array.isArray(members));
    // Assert on `revoked`, not `rotated`: the loser was a
    // replay, so the rotation count was already one.
    const revoked = (await deriveIdentityTokensFor(
        db, 'XXZruirZyAOoRpNxaDnpSA',
    )).filter(row => row.action === 'revoked');
    assertStrictEquals(revoked.length, 0);
    assertNotStrictEquals(client.getSessionCredentials(), null);
}));

Deno.test(
    'a 401 recovery carries the failing'
        + ' operation-id',
    () => withLocalStorageAsync(
        freshStorage(),
        async () => {
            const organization = 'AjdvjuECVZEgZoFajaIEkg';
            const dead = await expiredToken();
            const flat = await devToken();
            const scoped = await organizationToken();
            const refresh = await devToken();
            const seen: {
                kind: string;
                operationId: string | null;
                requestId: string | null;
            }[] = [];
            let reads = 0;
            function record(
                kind: string,
                fields:
                    | readonly (readonly [string, string])[]
                    | undefined,
            ): void {
                let operationId: string | null = null;
                let requestId: string | null = null;
                for (const [name, value] of fields ?? []) {
                    const key = name.toLowerCase();
                    if (key === OPERATION_ID_HEADER) {
                        operationId = value;
                    }
                    if (key === 'request-id') {
                        requestId = value;
                    }
                }
                seen.push({
                    kind, operationId, requestId,
                });
            }
            const unused = (): never => {
                throw new Error('unused verb');
            };
            const facade: HttpFacade = {
                GET: <T>(
                    resource: string,
                    _token: string,
                    fields?:
                        readonly (readonly [
                            string,
                            string,
                        ])[],
                ): Promise<T> => {
                    if (resource.endsWith(
                        '/organizations/',
                    )) {
                        record('re-scope', fields);
                        return Promise.resolve([{
                            id: organization,
                        }] as T);
                    }
                    if (resource.endsWith(
                        '/default-organization',
                    )) {
                        record('re-scope', fields);
                        return Promise.resolve({
                            organization_id: organization,
                        } as T);
                    }
                    record('read', fields);
                    reads += 1;
                    if (reads === 1) {
                        return Promise.reject(
                            new UnauthorizedError(
                                'invalid_token',
                            ),
                        );
                    }
                    return Promise.resolve([] as T);
                },
                GETWithEtag: unused,
                PUT: unused,
                PUTWithEtag: unused,
                PATCH: unused,
                PATCHWithEtag: unused,
                DELETE: unused,
                POST: unused,
                postForHeaders: (
                    _resource, payload, _token, fields,
                ) => {
                    const grant = payload.grant_type;
                    const kind = grant === 'refresh'
                        ? 'refresh'
                        : 'exchange';
                    record(kind, fields);
                    const access = grant === 'refresh'
                        ? flat
                        : scoped;
                    const headers = new Headers();
                    headers.set(
                        'authentication-info',
                        'access_token="' + access + '"',
                    );
                    if (grant === 'refresh') {
                        headers.append(
                            'set-cookie',
                            'refresh_token=' + refresh
                                + '; HttpOnly',
                        );
                    }
                    return Promise.resolve({
                        status: 200,
                        headers,
                        body: '',
                    });
                },
            };
            const client = createAppClient(() => facade);
            clients.push(client);
            client.putSessionCredentials({
                accessToken: dead,
                refreshToken: refresh,
            });
            client.putSessionToken(dead);
            const ctx = client.recoveringRequestContext(
                dead,
            );
            const rows = await ctx.GET(
                'organizations/' + organization
                    + '/ideas/',
            );
            assert(Array.isArray(rows));
            const kinds = seen.map((row) => row.kind);
            assertEquals(
                kinds.filter((kind) => kind === 'read'),
                ['read', 'read'],
            );
            assertEquals(
                kinds.filter((kind) =>
                    kind === 'refresh'),
                ['refresh'],
            );
            assertEquals(
                kinds.filter((kind) =>
                    kind === 're-scope'),
                ['re-scope', 're-scope'],
            );
            assertEquals(
                kinds.filter((kind) =>
                    kind === 'exchange'),
                ['exchange'],
            );
            for (const row of seen) {
                assertStrictEquals(
                    row.operationId, ctx.operationId,
                );
                assertStrictEquals(
                    row.requestId, null,
                );
            }
        },
    ),
);
