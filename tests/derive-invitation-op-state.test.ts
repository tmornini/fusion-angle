import { assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import type { Id, MembershipEntity } from '../shared/types.ts';
import {
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest,
    invitationLatched,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';

// The document-head oracle: an invitation GET is ONE document
// read whose head carries `state`. This file proves it agrees
// with the invitation's newest version (the last part) over
// the three live lifecycles plus pending and never-granted.

const SARAH = 'MQFcPtrZPIGjMCRAXtZUnA';
const JESSICA = 'zyGBRshxOnKHUfcyFRqowg';
const EMILY = 'CJrglMsNBxOWWfbihHQSeg';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

function nameOf(identity: Id): string {
    return membershipNameOf(ORGANIZATION_TWO, identity);
}

async function readState(
    db: MemoryDbAdapter, id: Id,
): Promise<string | undefined> {
    const body = await adminRead(db, id) as
        { state: string } | undefined;
    return body?.state;
}

// The newest version is the last part.
async function newestVersionState(
    db: MemoryDbAdapter, id: Id,
): Promise<string | undefined> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + id + '/versions/', admin,
    ));
    if (res.status === 404) {
        await res.body?.cancel();
        return undefined;
    }
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<MembershipEntity>(res);
    return parts.at(-1)?.body().toValue().state;
}

async function adminRead(
    db: MemoryDbAdapter, resource: string,
): Promise<unknown> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/' + resource, admin,
    ));
    if (res.status === 404) {
        await res.body?.cancel();
        return undefined;
    }
    assertStrictEquals(res.status, 200);
    return await res.json();
}

async function grant(
    db: MemoryDbAdapter,
    email: string,
): Promise<void> {
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
    );
    const res = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email,
            grantAt: '2026-06-01T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(res.status, 201);
    await res.body?.cancel();
}

Deno.test('an invitation GET: pending (granted, unanswered)'
+ ' reads \'pending\', matching its newest version',
async () => {
    const db = await seededDb();
    await grant(db, 'sarah.chen@company.com');
    const id = nameOf(SARAH);

    assertStrictEquals(
        await readState(db, id), 'pending',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: accepted reads \'accepted\','
+ ' matching its newest version', async () => {
    const db = await seededDb();
    const id = nameOf(SARAH);
    await grant(db, 'sarah.chen@company.com');

    const accept = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + SARAH + '/invitations/' + id,
            await organizationToken(SARAH, ORGANIZATION_TWO),
            {
                state: 'accepted',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(accept.status, 200);
    await accept.body?.cancel();

    assertStrictEquals(
        await readState(db, id), 'accepted',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: declined reads \'declined\','
+ ' matching its newest version', async () => {
    const db = await seededDb();
    const id = nameOf(JESSICA);
    await grant(db, 'jessica.park@company.com');

    const decline = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/identities/' + JESSICA + '/invitations/' + id,
            await organizationToken(JESSICA, ORGANIZATION_TWO),
            {
                state: 'declined',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(decline.status, 200);
    await decline.body?.cancel();

    assertStrictEquals(
        await readState(db, id), 'declined',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: revoked reads \'revoked\','
+ ' matching its newest version', async () => {
    const db = await seededDb();
    const id = nameOf(EMILY);
    await grant(db, 'emily.rodriguez@company.com');

    const revoke = await handleRequest(
        db, await invitationLatched(db, req(
            'PUT',
            '/organizations/' + ORGANIZATION_TWO
                + '/invitations/' + id,
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
            ),
            {
                state: 'revoked',
                at: '2026-06-01T00:00:01.000000Z',
            },
        )),
    );
    assertStrictEquals(revoke.status, 200);
    await revoke.body?.cancel();

    assertStrictEquals(
        await readState(db, id), 'revoked',
    );
    assertStrictEquals(
        await readState(db, id),
        await newestVersionState(db, id),
    );
});

Deno.test('an invitation GET: a never-granted name answers'
+ ' 404, as its version list does', async () => {
    const db = await seededDb();
    const id = nameOf(generateIdentifier());
    assertStrictEquals(await readState(db, id), undefined);
    assertStrictEquals(
        await newestVersionState(db, id), undefined,
    );
});
