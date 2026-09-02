import { assert, assertStrictEquals } from '@std/assert';
import type { MemoryDbAdapter } from '../api/db-memory.ts';
import { ORGANIZATION_TWO } from
    '../api/mock-data/seed-constants.ts';
import { deriveIdentityPiiRows } from
    '../api/derive-identity-spine.ts';
import {
    deriveInvitations,
} from '../api/derive-invitations.ts';
import {
    pendingInvitationFor,
} from '../api/invitations-domain.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const INV_REHOME_PARITY_1_GRANT = generateIdentifier();
const INV_REHOME_PARITY_1_DECLINE = generateIdentifier();
const INV_REHOME_PARITY_2 = generateIdentifier();
const INV_REHOME_PARITY_2_GRANT = generateIdentifier();
const INV_REHOME_LOAD_1 = generateIdentifier();
const INV_REHOME_LOAD_1_GRANT = generateIdentifier();
const INV_GHOST = generateIdentifier();

// Phase 15 gate 6 parity pins: the re-homes that close
// Author gate 6 for the exit census.
//
// 1. grantInvitation email resolution —
//    deriveIdentityPiiRows email match ≡ identityPii.getAll
// 2. pendingInvitationFor discovery —
//    deriveInvitations pending ≡ row-plane pending
// 3. grantClientCredentials client lookup — RETIRED with
//    the clients table (rawReadRow + clients store gone;
//    registration facet is the sole oracle).

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
        operationId: TEST_OPERATION_ID,
    });
}

async function seededDb(): Promise<MemoryDbAdapter> {
    return seededMockDb();
}

// Phase Final Task 2: invitations ROW half stripped — the
// row-plane oracle is retired. pendingInvitationFor is the
// sole pending discovery path (message plane).

Deno.test('deriveIdentityPiiRows resolves grantInvitation email'
+ ' (Phase Final Task 2: identity_pii ROW half stripped —'
+ ' message plane is sole oracle)',
async () => {
    const db = await seededDb();
    const email = 'sarah.chen@company.com';
    const fromPairs = (await deriveIdentityPiiRows(db))
        .find(p => p.email === email);
    assert(fromPairs !== undefined);
    assertStrictEquals(fromPairs!.email, email);
    // Phase Final Stage B: identity spine tables retired.

    // Unknown email: message plane misses.
    const missing = 'nobody@example.invalid';
    assertStrictEquals(
        (await deriveIdentityPiiRows(db))
            .find(p => p.email === missing),
        undefined,
    );
});

Deno.test('pendingInvitationFor lifecycle on the message plane'
+ ' (grant/decline/reinvite)', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const inviteeId = 'MQFcPtrZPIGjMCRAXtZUnA';
    const inviteeToken = await organizationToken(
        inviteeId, ORGANIZATION_TWO);

    async function assertPending(): Promise<
        { id: string; at: string } | null
    > {
        const fromFn = await pendingInvitationFor(
            db, ORGANIZATION_TWO, inviteeId);
        // deriveInvitations' own state field agrees with
        // the pending discovery for the matched id.
        if (fromFn !== null) {
            const derived = (await deriveInvitations(db))
                .find(r => r.id === fromFn.id);
            assertStrictEquals(derived?.state, 'pending');
            assertStrictEquals(
                derived?.organization_id, ORGANIZATION_TWO);
            assertStrictEquals(derived?.identity_id, inviteeId);
        }
        return fromFn;
    }

    assertStrictEquals(await assertPending(), null);

    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: 'iqtxKmWMdfYjxphbQhAJnw',
            grantEventId: INV_REHOME_PARITY_1_GRANT,
            grantAt: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 200);
    assertStrictEquals(
        (await assertPending())?.id,
        'iqtxKmWMdfYjxphbQhAJnw',
    );

    const decline = await handleRequest(db, req(
        'PUT',
        '/identities/' + inviteeId
            + '/invitations/iqtxKmWMdfYjxphbQhAJnw',
        inviteeToken, {
            state: 'declined',
            eventId: INV_REHOME_PARITY_1_DECLINE,
            at: '2026-06-02T00:00:01.000000Z',
        },
    ));
    assertStrictEquals(decline.status, 204);
    assertStrictEquals(await assertPending(), null);

    // Declined-reinvite: multi-candidate on the same
    // (organization, identity) pair.
    const regrant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: INV_REHOME_PARITY_2,
            grantEventId: INV_REHOME_PARITY_2_GRANT,
            grantAt: '2026-06-02T00:00:02.000000Z',
        },
    ));
    assertStrictEquals(regrant.status, 200);
    assertStrictEquals(
        (await assertPending())?.id,
        INV_REHOME_PARITY_2,
    );
    // Phase Final Stage B: roster tables retired.
});

Deno.test('loadInvitation shape: deriveInvitations find-by-id'
+ ' for a live grant, absent for missing', async () => {
    const db = await seededDb();
    const admin = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);
    const grant = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/invitations/', admin, {
            email: 'sarah.chen@company.com',
            invitationId: INV_REHOME_LOAD_1,
            grantEventId: INV_REHOME_LOAD_1_GRANT,
            grantAt: '2026-06-02T00:00:00.000000Z',
        },
    ));
    assertStrictEquals(grant.status, 200);

    // Phase Final Task 2: invitations ROW half stripped.
    const derived = (await deriveInvitations(db))
        .find(r => r.id === INV_REHOME_LOAD_1);
    assert(derived !== undefined);
    assertStrictEquals(derived.id, INV_REHOME_LOAD_1);
    assertStrictEquals(derived.organization_id, ORGANIZATION_TWO);
    assertStrictEquals(derived.state, 'pending');

    // Missing id: message plane absent.
    assertStrictEquals(
        (await deriveInvitations(db))
            .find(r => r.id === INV_GHOST),
        undefined,
    );
    // Phase Final Stage B: roster tables retired.
});
