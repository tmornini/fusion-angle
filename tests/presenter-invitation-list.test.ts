// state.ts reads localStorage / window / document at
// module-eval time; stub before importing presenters.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const {
    InvitationListPresenter,
    SentInvitationsPresenter,
} = await import(
    '../web-app/app/presenters/invitation-list.ts'
);

function record(): {
    container: HTMLElement;
    html: () => string;
} {
    let value = '';
    const el = {
        set innerHTML(v: string) {
            value = v;
        },
        get innerHTML(): string {
            return value;
        },
    };
    return {
        container: el as unknown as HTMLElement,
        html: () => value,
    };
}

const PENDING = {
    id: 'inv1',
    organizationId: '2',
    organizationName: 'Wayne Enterprises',
    invitedByName: 'Tony Stark',
    invitedAt: '2026-01-01T00:00:00.000000Z',
    state: 'pending' as const,
};

test('a pending invitation shows the org, inviter, and'
    + ' Accept / Decline', () => {
    const rec = record();
    new InvitationListPresenter([PENDING]).render(rec.container);
    const out = rec.html();
    assert.match(out, /data-invitation-id="inv1"/);
    assert.match(out, /Wayne Enterprises/);
    assert.match(out, /Tony Stark/);
    assert.match(out, /data-invitation-action="accept"/);
    assert.match(out, /data-invitation-action="decline"/);
    assert.match(out, /Pending/);
});

test('a non-pending invitation offers no actions', () => {
    const rec = record();
    new InvitationListPresenter([
        { ...PENDING, state: 'accepted' as const },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, /Accepted/);
    assert.doesNotMatch(out, /data-invitation-action="accept"/);
    assert.doesNotMatch(out,
        /data-invitation-action="decline"/);
});

test('an absent inviter omits the Invited by line', () => {
    const rec = record();
    new InvitationListPresenter([{
        id: 'inv3',
        organizationId: '2',
        organizationName: 'Wayne Enterprises',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
    }]).render(rec.container);
    assert.doesNotMatch(rec.html(), /Invited by/);
});

test('an absent org name renders the absence glyph', () => {
    const rec = record();
    new InvitationListPresenter([{
        id: 'inv4',
        organizationId: '2',
        invitedByName: 'Tony Stark',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
    }]).render(rec.container);
    assert.match(rec.html(), /—/);
});

test('an empty invitee list shows the empty state', () => {
    const rec = record();
    new InvitationListPresenter([]).render(rec.container);
    assert.match(rec.html(), /No invitations/);
});

test('a sent invitation shows the invitee email and Revoke',
() => {
    const rec = record();
    new SentInvitationsPresenter([
        {
            id: 'inv2',
            organizationId: '2',
            identityId: 'sarah',
            inviteeEmail: 'sarah@x.com',
            invitedAt: '2026-01-01T00:00:00.000000Z',
            state: 'pending' as const,
        },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, /data-invitation-id="inv2"/);
    assert.match(out, /sarah@x\.com/);
    assert.match(out, /data-invitation-action="revoke"/);
});

test('an absent invitee email renders the absence glyph',
() => {
    const rec = record();
    new SentInvitationsPresenter([{
        id: 'inv5',
        organizationId: '2',
        identityId: 'sarah',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
    }]).render(rec.container);
    assert.match(rec.html(), /—/);
});

test('an empty sent list shows the empty state', () => {
    const rec = record();
    new SentInvitationsPresenter([]).render(rec.container);
    assert.match(rec.html(), /No outstanding invitations/);
});
