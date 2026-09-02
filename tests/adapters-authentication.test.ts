import {
    assert,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { testHashPassword } from './mock-seed.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postPasswordLogin,
} from '../web-app/app/adapters/authentication.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
} from './identity-fixtures.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';
import { seedSeat } from './root-admin-fixture.ts';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

// Below-facade pair formation (the member-fixtures.ts idiom):
// postPasswordLogin's own gate-valid GET /members below depends
// on role_grants/memberships deriving from the message plane once
// they flip, so a raw row here would go derivation-invisible.
// Every id/field value stays IDENTICAL to the raw puts these
// replace — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    _id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    // A real organizations/:id document (Phase 13 Task 3's
    // fixture prerequisite; seedOrganizationDocument is idempotent
    // — a no-op on a repeat organization id) — a membership pair
    // with no document for its own org stays derivation-invisible
    // to deriveMembershipsForIdentity's own enumerate-then-probe
    // (via deriveOrganizations).
    await seedOrganizationDocument(db, organization, organization);
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

async function passwordUserCtx() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm', {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'XXZruirZyAOoRpNxaDnpSA',
        type: 'admin',
        at: '2020-01-01T00:00:00.000000Z',
    });
    // Below-facade pair formation (Phase 13 Task 8): the login
    // grant's pii-by-email lookup and credential check now derive
    // from the message ledger, so a raw row here would go
    // derivation-invisible.
    await seedIdentityPii(db, 'XXZruirZyAOoRpNxaDnpSA', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'XXZruirZyAOoRpNxaDnpSA'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'XXZruirZyAOoRpNxaDnpSA', kind: 'password',
        status: 'set',
        secret: await testHashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000000Z',
    });
    const ctx = createRequestContext(
        db, await devToken('anonymous'));
    return { db, ctx };
}

Deno.test('postPasswordLogin returns a gate-valid credential pair',
async () => {
    const { db, ctx } = await passwordUserCtx();
    const creds = await postPasswordLogin(
        ctx, 'demo@example.com', 's3cret');
    assert(creds);
    assert(Array.isArray(
        await GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/'
            , creds.accessToken)));
});

Deno.test('postPasswordLogin issues a 30-day refresh token',
async () => {
    const { ctx } = await passwordUserCtx();
    const creds = await postPasswordLogin(
        ctx, 'demo@example.com', 's3cret');
    assert(creds);
    const claims = decodeAccessToken(creds.refreshToken);
    assertStrictEquals(
        claims.exp - claims.iat, REFRESH_TTL_SECONDS);
});

Deno.test('postPasswordLogin returns null on a wrong password',
async () => {
    const { ctx } = await passwordUserCtx();
    assertStrictEquals(
        await postPasswordLogin(
            ctx, 'demo@example.com', 'WRONG'),
        null);
});

Deno.test('postPasswordLogin returns null for an unknown user',
async () => {
    const { ctx } = await passwordUserCtx();
    assertStrictEquals(
        await postPasswordLogin(
            ctx, 'ghost@example.com', 's3cret'),
        null);
});

Deno.test('postPasswordLogin rethrows a non-401 fault, never masks',
async () => {
    // An upstream 500 / network fault is a BUG, not a wrong
    // password — it must surface, not collapse to null.
    const ctx = {
        POST: async () => {
            throw new Error('upstream 500');
        },
    } as unknown as RequestContext;
    await assertRejects(
        () => postPasswordLogin(ctx, 'a@b.c', 'pw'),
        Error,
        'upstream 500',
    );
});

Deno.test('postPasswordLogin sends S256 challenge and verifier',
async () => {
    const posted: Record<string, unknown>[] = [];
    const ctx = {
        POST: async (_path: string, body: unknown) => {
            posted.push(body as Record<string, unknown>);
            if (posted.length === 1) {
                return { code: 'issued-code' };
            }
            return {
                access_token: 'a',
                refresh_token: 'r',
            };
        },
    } as unknown as RequestContext;
    await postPasswordLogin(ctx, 'a@b.c', 'pw');
    const authorizeBody = posted[0]!;
    const tokenBody = posted[1]!;
    assertStrictEquals(
        authorizeBody.code_challenge_method, 'S256');
    assertStrictEquals(typeof tokenBody.code_verifier, 'string');
    assertStrictEquals(
        authorizeBody.code_challenge,
        bytesToBase64Url(
            await sha256Bytes(
                tokenBody.code_verifier as string,
            ),
        ),
    );
});
