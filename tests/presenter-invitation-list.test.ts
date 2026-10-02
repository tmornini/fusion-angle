import { assertMatch, assertNotMatch } from '@std/assert';
import {
    InvitationListPresenter,
    SentInvitationsPresenter,
} from '../web-app/app/presenters/invitation-list.ts';
import type { MembershipEntity } from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { responseMessage } from
    './fixtures/response-message.ts';

function heldMessage(
    id: string,
): HttpMessage<MembershipEntity> {
    return responseMessage({
        id,
        organization_id: 'BBjWJsjYIDkTRKIIPrzWRw',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member',
        state: 'pending',
        at: '2026-01-01T00:00:00.000000Z',
    });
}

// invitation-list.ts never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because these presenters' render() walks a real
// DOM element.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

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
    id: 'jEoYCFtPjXFEgZqZNtOcEA',
    organizationId: 'BBjWJsjYIDkTRKIIPrzWRw',
    invitedAt: '2026-01-01T00:00:00.000000Z',
    state: 'pending' as const,
    message: heldMessage('jEoYCFtPjXFEgZqZNtOcEA'),
};

Deno.test('a pending invitation shows the absence marker'
    + ' and Accept / Decline', () => {
    const rec = record();
    new InvitationListPresenter([PENDING]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /data-invitation-id="jEoYCFtPjXFEgZqZNtOcEA"/);
    assertMatch(out, /—/);
    assertNotMatch(out, /Invited by/);
    assertMatch(out, /data-invitation-action="accept"/);
    assertMatch(out, /data-invitation-action="decline"/);
    assertMatch(out, /Pending/);
});

Deno.test('a non-pending invitation offers no actions', () => {
    const rec = record();
    new InvitationListPresenter([
        { ...PENDING, state: 'accepted' as const },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /Accepted/);
    assertNotMatch(out, /data-invitation-action="accept"/);
    assertNotMatch(out,
        /data-invitation-action="decline"/);
});

Deno.test('an absent inviter omits the Invited by line', () => {
    const rec = record();
    new InvitationListPresenter([{
        id: 'inv3',
        organizationId: 'BBjWJsjYIDkTRKIIPrzWRw',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
        message: heldMessage('inv3'),
    }]).render(rec.container);
    assertNotMatch(rec.html(), /Invited by/);
});

Deno.test('the org name renders the absence glyph', () => {
    const rec = record();
    new InvitationListPresenter([{
        id: 'inv4',
        organizationId: 'BBjWJsjYIDkTRKIIPrzWRw',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
        message: heldMessage('inv4'),
    }]).render(rec.container);
    assertMatch(rec.html(), /—/);
});

Deno.test('an empty invitee list shows the empty state', () => {
    const rec = record();
    new InvitationListPresenter([]).render(rec.container);
    assertMatch(rec.html(), /No invitations/);
});

Deno.test('a sent invitation shows the absence marker'
    + ' and Revoke', () => {
    const rec = record();
    new SentInvitationsPresenter([
        {
            id: 'inv2',
            organizationId: 'BBjWJsjYIDkTRKIIPrzWRw',
            identityId: 'toccYYkLEABmlbpHJalgtQ',
            invitedAt: '2026-01-01T00:00:00.000000Z',
            state: 'pending' as const,
            message: heldMessage('inv2'),
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /data-invitation-id="inv2"/);
    assertMatch(out, /—/);
    assertNotMatch(out, /sarah@x\.com/);
    assertMatch(out, /data-invitation-action="revoke"/);
});

Deno.test('an absent invitee email renders the absence glyph',
() => {
    const rec = record();
    new SentInvitationsPresenter([{
        id: 'inv5',
        organizationId: 'BBjWJsjYIDkTRKIIPrzWRw',
        identityId: 'toccYYkLEABmlbpHJalgtQ',
        invitedAt: '2026-01-01T00:00:00.000000Z',
        state: 'pending' as const,
        message: heldMessage('inv5'),
    }]).render(rec.container);
    assertMatch(rec.html(), /—/);
});

Deno.test('an empty sent list shows the empty state', () => {
    const rec = record();
    new SentInvitationsPresenter([]).render(rec.container);
    assertMatch(rec.html(), /No outstanding invitations/);
});
