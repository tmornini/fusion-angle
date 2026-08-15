import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { GET } from '../api/api.ts';
import { hashPassword } from '../shared/password-hash.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    postPasswordLogin,
} from '../web-app/app/adapters/authentication.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
} from './identity-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { sha256Bytes } from '../shared/digest.ts';
import { bytesToBase64Url } from '../shared/base64url.ts';

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

// Below-facade pair formation (the member-fixtures.ts idiom):
// postPasswordLogin's own gate-valid GET /members below depends
// on role_grants/memberships deriving from the pair plane once
// they flip, so a raw row here would go derivation-invisible.
// Every id/field value stays IDENTICAL to the raw puts these
// replace — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
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
        operationId: TEST_OPERATION_ID,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function passwordUserCtx() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedMembershipPair(db, 'm', {
        organization_id: '1',
        identity_id: 'current',
        type: 'admin',
        at: '2020-01-01T00:00:00.000000Z',
    });
    // Below-facade pair formation (Phase 13 Task 8): the login
    // grant's pii-by-email lookup and credential check now derive
    // from the message ledger, so a raw row here would go
    // derivation-invisible.
    await seedIdentityPii(db, 'current', {
        name: 'Demo', email: 'demo@example.com',
        phone: '555-0100', bio: 'demo user',
    });
    await seedIdentityCredential(db, 'current', 'c1', {
        identity_id: 'current', kind: 'password',
        status: 'set', secret: await hashPassword('s3cret'),
        at: '2026-06-03T00:00:00.000000Z',
    });
    const ctx = createRequestContext(
        db, await devToken('anonymous'));
    return { db, ctx };
}

test('postPasswordLogin returns a gate-valid credential pair',
async () => {
    const { db, ctx } = await passwordUserCtx();
    const creds = await postPasswordLogin(
        ctx, 'demo@example.com', 's3cret');
    assert.ok(creds);
    assert.ok(Array.isArray(
        await GET(db, 'members', creds.accessToken)));
});

test('postPasswordLogin issues a 30-day refresh token',
async () => {
    const { ctx } = await passwordUserCtx();
    const creds = await postPasswordLogin(
        ctx, 'demo@example.com', 's3cret');
    assert.ok(creds);
    const claims = decodeAccessToken(creds.refreshToken);
    assert.equal(
        claims.exp - claims.iat, REFRESH_TTL_SECONDS);
});

test('postPasswordLogin returns null on a wrong password',
async () => {
    const { ctx } = await passwordUserCtx();
    assert.equal(
        await postPasswordLogin(
            ctx, 'demo@example.com', 'WRONG'),
        null);
});

test('postPasswordLogin returns null for an unknown user',
async () => {
    const { ctx } = await passwordUserCtx();
    assert.equal(
        await postPasswordLogin(
            ctx, 'ghost@example.com', 's3cret'),
        null);
});

test('postPasswordLogin rethrows a non-401 fault, never masks',
async () => {
    // An upstream 500 / network fault is a BUG, not a wrong
    // password — it must surface, not collapse to null.
    const ctx = {
        POST: async () => {
            throw new Error('upstream 500');
        },
    } as unknown as RequestContext;
    await assert.rejects(
        () => postPasswordLogin(ctx, 'a@b.c', 'pw'),
        /upstream 500/);
});

test('postPasswordLogin sends S256 challenge and verifier',
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
    assert.equal(
        authorizeBody.code_challenge_method, 'S256');
    assert.equal(typeof tokenBody.code_verifier, 'string');
    assert.equal(
        authorizeBody.code_challenge,
        bytesToBase64Url(
            await sha256Bytes(
                tokenBody.code_verifier as string,
            ),
        ),
    );
});
