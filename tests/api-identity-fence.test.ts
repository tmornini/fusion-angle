import {
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { canonicalPath } from '../api/message-pair.ts';
import { credentialsPrefixFor } from
    '../api/derive-identity-spine.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from
    './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import {
    apiRequest,
    partBodiesOf,
    presentedFields,
    withoutCredentialFields,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

const ADMIN_B = 'XXZruirZyAOoRpNxaDnpSA';
const AT = '2026-01-01T00:00:00.000000Z';
const SECRET = 'fence-secret';
const SELF_TREE =
    'forbidden: an identity may act only'
    + ' within its own tree';
const SERVICE_KIND =
    'client registration requires a'
    + " kind-'service' identity";

type World = {
    readonly db: MemoryDbAdapter;
    readonly organizationA: string;
    readonly organizationB: string;
    readonly adminA: string;
    readonly memberA: string;
    readonly adminB: string;
    readonly memberB: string;
    readonly memberAEmail: string;
    readonly memberBEmail: string;
};

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function pairCount(
    db: MemoryDbAdapter,
): Promise<number> {
    return (await db.messagePairs.getAll()).length;
}

async function adminToken(org: string): Promise<string> {
    return organizationToken(ADMIN_B, org);
}

async function memberToken(
    id: string, org: string,
): Promise<string> {
    return organizationToken(id, org);
}

async function world(): Promise<World> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    const adminA = generateIdentifier();
    const memberA = generateIdentifier();
    const memberB = generateIdentifier();
    const memberAEmail = 'member-a@a.test';
    const memberBEmail = 'member-b@b.test';
    await seedOrganizationDocument(db, organizationA, 'Alpha');
    await seedOrganizationDocument(db, organizationB, 'Beta');
    await seedPersonIdentity(db, adminA, {
        name: 'Admin A', email: 'admin-a@a.test',
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, memberA, {
        name: 'Member A', email: memberAEmail,
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, ADMIN_B, {
        name: 'Admin B', email: 'admin-b@b.test',
        phone: '', bio: '',
    });
    await seedPersonIdentity(db, memberB, {
        name: 'Member B', email: memberBEmail,
        phone: '', bio: '',
    });
    await seedSeat(db, organizationA, adminA, 'admin', AT);
    await seedSeat(db, organizationA, memberA, 'member', AT);
    await seedSeat(db, organizationB, ADMIN_B, 'admin', AT);
    await seedSeat(db, organizationB, memberB, 'member', AT);
    return {
        db, organizationA, organizationB, adminA, memberA,
        adminB: ADMIN_B, memberB,
        memberAEmail, memberBEmail,
    };
}

async function call(
    db: MemoryDbAdapter,
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Promise<{ status: number; error: string }> {
    const response = await handleRequest(
        db, apiRequest({ method, path, token, body }),
    );
    const status = response.status;
    const text = await response.text();
    if (status < 400 || text === '') {
        return { status, error: '' };
    }
    const parsed = JSON.parse(text) as { error?: string };
    return { status, error: parsed.error ?? '' };
}

Deno.test('an admin cannot put a password on another'
    + ' organization', async () => {
    const fx = await world();
    const cid = generateIdentifier();
    const path = '/identities/' + fx.memberA
        + '/credentials/' + cid;
    const before = (await fx.db.messagePairs
        .getCollectionPairs(
            credentialsPrefixFor(fx.memberA),
        )).length;
    const put = await call(
        fx.db, 'PUT', path,
        await adminToken(fx.organizationB),
        {
            identity_id: fx.memberA,
            kind: 'password',
            status: 'set',
            secret: SECRET,
            at: AT,
        },
    );
    assertStrictEquals(put.status, 403);
    assertStrictEquals(put.error, outside('PUT', path));
    assertStrictEquals(
        (await fx.db.messagePairs.getCollectionPairs(
            credentialsPrefixFor(fx.memberA),
        )).length,
        before,
    );
    const lifted = withoutCredentialFields({
        method: 'password',
        username: fx.memberAEmail,
        password: SECRET,
        client_id: 'web',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
    });
    const login = await handleRequest(fx.db, apiRequest({
        method: 'POST',
        path: '/authentication/authorize',
        body: lifted.body,
        headers: lifted.headers,
    }));
    assertStrictEquals(login.status, 401);
    const fields = await presentedFields(login);
    assertEquals(fields.code, undefined);
    assertEquals(fields.error, 'invalid_grant');
    const codes = await fx.db.messagePairs
        .getCollectionPairs(canonicalPath(
            undefined, '/authentication/authorize/',
        ));
    assertStrictEquals(codes.length, 0);
});

type Hop = {
    readonly label: string;
    readonly method: string;
    readonly pathOf: (id: string) => string;
    readonly body?: Record<string, unknown>;
    readonly coMember: number;
    readonly coMemberError?: string;
};

Deno.test('an admin names only co-members on identity'
    + ' routes', async () => {
    const fx = await world();
    const token = await adminToken(fx.organizationB);
    const cred = generateIdentifier();
    const rid = generateIdentifier();
    const jti = generateIdentifier();
    const rotate = generateIdentifier();
    const revoke = generateIdentifier();
    const provider = generateIdentifier();
    const chain = generateIdentifier();
    const etag = generateIdentifier();
    const seatA = membershipNameOf(fx.organizationA, fx.memberA);
    const seatB = membershipNameOf(fx.organizationB, fx.memberB);
    const pii = {
        name: 'Member B',
        email: fx.memberBEmail,
        phone: '',
        bio: '',
    };
    const registration = {
        grant_types: 'client_credentials',
        redirect_uris: '',
        jwks: '{"keys":[]}',
        aud: 'fusion-angle',
        status: 'active',
    };
    const tokenBody = {
        action: 'issued',
        chain_id: chain,
        at: AT,
    };
    const providerBody = {
        provider: 'local',
        provider_subject: 'subject',
        action: 'linked',
        at: AT,
    };
    const hops: readonly Hop[] = [
        {
            label: 'GET identity',
            method: 'GET',
            pathOf: (id) => '/identities/' + id,
            coMember: 200,
        },
        {
            label: 'PUT identity',
            method: 'PUT',
            pathOf: (id) => '/identities/' + id,
            body: { kind: 'person' },
            coMember: 200,
        },
        {
            label: 'GET pii',
            method: 'GET',
            pathOf: (id) => '/identities/' + id + '/pii',
            coMember: 200,
        },
        {
            label: 'PUT pii',
            method: 'PUT',
            pathOf: (id) => '/identities/' + id + '/pii',
            body: pii,
            coMember: 200,
        },
        {
            label: 'GET credentials',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/credentials/',
            coMember: 204,
        },
        {
            label: 'PUT credential',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id + '/credentials/' + cred,
            body: {
                identity_id: fx.memberB,
                kind: 'password',
                status: 'set',
                secret: SECRET,
                at: AT,
            },
            coMember: 201,
        },
        {
            label: 'GET registration',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/registration',
            coMember: 400,
            coMemberError: SERVICE_KIND,
        },
        {
            label: 'PUT registration',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id + '/registration',
            body: registration,
            coMember: 400,
            coMemberError: SERVICE_KIND,
        },
        {
            label: 'PUT token revocation',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id
                + '/token-revocations/' + rid,
            body: { at: AT },
            coMember: 201,
        },
        {
            label: 'GET tokens',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/tokens/',
            coMember: 204,
        },
        {
            label: 'PUT token',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id + '/tokens/' + jti,
            body: tokenBody,
            coMember: 201,
        },
        {
            label: 'POST rotation',
            method: 'POST',
            pathOf: (id) =>
                '/identities/' + id + '/tokens/'
                + rotate + '/rotation',
            body: {},
            coMember: 409,
        },
        {
            label: 'POST revocation',
            method: 'POST',
            pathOf: (id) =>
                '/identities/' + id + '/tokens/'
                + revoke + '/revocation',
            body: {},
            coMember: 404,
        },
        {
            label: 'GET providers',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/providers/',
            coMember: 204,
        },
        {
            label: 'PUT provider',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id + '/providers/'
                + provider,
            body: providerBody,
            coMember: 201,
        },
        {
            label: 'GET default organization',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id
                + '/default-organization',
            coMember: 403,
            coMemberError: SELF_TREE,
        },
        {
            label: 'PUT default organization',
            method: 'PUT',
            pathOf: (id) =>
                '/identities/' + id
                + '/default-organization',
            body: { organization_id: fx.organizationB },
            coMember: 403,
            coMemberError: SELF_TREE,
        },
        {
            label: 'GET organizations',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/organizations/',
            coMember: 200,
        },
        {
            label: 'GET invitations',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/invitations/',
            coMember: 200,
        },
        {
            label: 'GET invitation',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/invitations/'
                + (id === fx.memberA ? seatA : seatB),
            coMember: 200,
        },
        {
            label: 'GET identity versions',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/versions/',
            coMember: 200,
        },
        {
            label: 'GET identity version',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/versions/' + etag,
            coMember: 404,
        },
        {
            label: 'GET invitation versions',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/invitations/'
                + (id === fx.memberA ? seatA : seatB)
                + '/versions/',
            coMember: 200,
        },
        {
            label: 'GET invitation version',
            method: 'GET',
            pathOf: (id) =>
                '/identities/' + id + '/invitations/'
                + (id === fx.memberA ? seatA : seatB)
                + '/versions/' + etag,
            coMember: 404,
        },
    ];
    for (const hop of hops) {
        const foreignPath = hop.pathOf(fx.memberA);
        const before = await pairCount(fx.db);
        const foreign = await call(
            fx.db, hop.method, foreignPath, token,
            hop.body,
        );
        assertStrictEquals(
            foreign.status, 403, hop.label + ' foreign',
        );
        assertStrictEquals(
            foreign.error,
            outside(hop.method, foreignPath),
            hop.label,
        );
        assertStrictEquals(
            await pairCount(fx.db), before,
            hop.label + ' stored',
        );
        const homePath = hop.pathOf(fx.memberB);
        const home = await call(
            fx.db, hop.method, homePath, token, hop.body,
        );
        assertStrictEquals(
            home.status, hop.coMember,
            hop.label + ' co-member',
        );
        if (hop.coMemberError !== undefined) {
            assertStrictEquals(
                home.error, hop.coMemberError, hop.label,
            );
        }
    }
});

Deno.test('GET identities/ lists only the claim'
    + ' organization', async () => {
    const fx = await world();
    const response = await handleRequest(fx.db, apiRequest({
        method: 'GET',
        path: '/identities/',
        token: await adminToken(fx.organizationB),
    }));
    assertStrictEquals(response.status, 200);
    const ids = (await partBodiesOf<{ id: string }>(
        response,
    )).map((row) => row.id).sort();
    assertEquals(ids, [fx.adminB, fx.memberB].sort());
});

Deno.test('an absent identity is forbidden, not missing',
async () => {
    const fx = await world();
    const absent = generateIdentifier();
    const path = '/identities/' + absent;
    const got = await call(
        fx.db, 'GET', path, await adminToken(fx.organizationB),
    );
    assertStrictEquals(got.status, 403);
    assertStrictEquals(got.error, outside('GET', path));
});

Deno.test('a member reads its own pii', async () => {
    const fx = await world();
    const response = await handleRequest(fx.db, apiRequest({
        method: 'GET',
        path: '/identities/' + fx.memberB + '/pii',
        token: await memberToken(fx.memberB, fx.organizationB),
    }));
    assertStrictEquals(response.status, 200);
    const body = await response.json() as { email: string };
    assertStrictEquals(body.email, fx.memberBEmail);
});

Deno.test('POST identities/ is not fenced', async () => {
    const fx = await world();
    const id = generateIdentifier();
    const response = await handleRequest(fx.db, apiRequest({
        method: 'POST',
        path: '/identities/',
        token: await adminToken(fx.organizationB),
        body: { id, kind: 'person' },
    }));
    assertStrictEquals(response.status, 201);
    await response.body?.cancel();
});
