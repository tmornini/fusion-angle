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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    claimToken, reachableToken,
} from './token-fixtures.ts';
import {
    postInvitationGrant,
    postInvitationAcceptance,
    postInvitationDecline,
    getInvitations,
} from '../web-app/app/adapters/invitations.ts';
import { getOrganizations } from
    '../web-app/app/adapters/organizations.ts';

const UNSEATED = 'dtmZgnDBlVcoyjxKzlaKgA';
const WAYNE = 'WlkfISpndVJfICRnWksipQ';

async function seeded() {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const gOrganization = sliceEntityId('g-org');
    const gAdmin = sliceEntityId('g-admin');
    const gCtx = createRequestContext(
        db,
        await claimToken({
            sub: gAdmin,
            organization: gOrganization,
            organizations: [gOrganization],
            roles: ['admin:' + gOrganization],
        }),
    );
    const wayneCtx = createRequestContext(
        db,
        await claimToken({
            sub: gAdmin,
            organization: WAYNE,
            organizations: [WAYNE],
            roles: ['admin:' + WAYNE],
        }),
    );
    const unseatedCtx = createRequestContext(
        db,
        await reachableToken(UNSEATED, []),
    );
    return { db, gOrganization, gCtx, wayneCtx, unseatedCtx };
}

test('G grant to unseated is sent', async () => {
    const { gCtx } = await seeded();
    assert.equal(
        await postInvitationGrant(
            gCtx,
            'g-unseated@test-plan.example',
        ),
        'sent',
    );
});

test('unseated sees one pending for g-org',
async () => {
    const { gCtx, gOrganization, unseatedCtx } =
        await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const pending = await getInvitations(
        unseatedCtx,
    );
    assert.equal(pending.length, 1);
    assert.equal(
        pending[0]!.organizationId, gOrganization,
    );
    assert.equal(pending[0]!.state, 'pending');
});

test('unseated accept seats g-org; re-accept no-op',
async () => {
    const { gCtx, gOrganization, unseatedCtx } =
        await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const [inv] = await getInvitations(
        unseatedCtx,
    );
    assert.ok(inv);
    await postInvitationAcceptance(
        unseatedCtx, inv.id,
    );
    const organizations = await getOrganizations(
        unseatedCtx,
    );
    assert.ok(
        organizations.some((o) => o.id === gOrganization),
    );
    await postInvitationAcceptance(
        unseatedCtx, inv.id,
    );
});

test('seated grant already-member; Wayne decline no-op',
async () => {
    const { gCtx, gOrganization, wayneCtx, unseatedCtx } =
        await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const [inv] = await getInvitations(
        unseatedCtx,
    );
    assert.ok(inv);
    await postInvitationAcceptance(
        unseatedCtx, inv.id,
    );
    assert.equal(
        await postInvitationGrant(
            gCtx, 'g-unseated@test-plan.example',
        ),
        'already-member',
    );
    assert.equal(
        await postInvitationGrant(
            gCtx, 'g-member@test-plan.example',
        ),
        'already-member',
    );
    assert.equal(
        await postInvitationGrant(
            wayneCtx,
            'g-unseated@test-plan.example',
        ),
        'sent',
    );
    const wayneInv = (await getInvitations(
        unseatedCtx,
    )).find((row) =>
        row.organizationId === WAYNE
            && row.state === 'pending');
    assert.ok(wayneInv);
    const before = await getOrganizations(
        unseatedCtx,
    );
    await postInvitationDecline(
        unseatedCtx, wayneInv.id,
    );
    const after = await getOrganizations(
        unseatedCtx,
    );
    assert.deepEqual(
        after.map((o) => o.id).sort(),
        before.map((o) => o.id).sort(),
    );
    assert.ok(
        after.some((o) => o.id === gOrganization),
    );
    await postInvitationDecline(
        unseatedCtx, wayneInv.id,
    );
});
