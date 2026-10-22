import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    ServiceMember,
    type MembershipEntity,
} from '../shared/types.ts';
import { responseMessage } from './fixtures/response-message.ts';
import { buildPageUrl } from '../web-app/app/navigation.ts';
import { type SeatRemoval } from
    '../web-app/app/presenters/human-member-detail.ts';
import {
    ServiceMemberDetailPresenter,
    ServiceMemberDetailEditPresenter,
    serviceMemberDraftFromMember,
} from '../web-app/app/presenters/service-member-detail.ts';

// The presenter never reads localStorage; window/document
// are stubbed because it walks a real DOM tree via
// renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

// Recording stub: the presenter writes into a container
// via setHtml on the shell, then mutateSlot calls
// $required(selector, container).querySelector then
// setHtml on the slot. Capture every write so the test
// can assert on the union.
function makeRecordingContainer(): {
    container: HTMLElement;
    allHtml: () => string;
} {
    let shell = '';
    const slots = new Map<string, { html: string }>();
    const makeSlot = (key: string) => {
        let slot = slots.get(key);
        if (!slot) {
            slot = { html: '' };
            slots.set(key, slot);
        }
        const ref = slot;
        return {
            set innerHTML(v: string) {
                ref.html = v;
            },
            get innerHTML(): string {
                return ref.html;
            },
            querySelector(_sel: string) {
                return null;
            },
        };
    };
    const container = {
        set innerHTML(v: string) {
            shell = v;
        },
        get innerHTML(): string {
            return shell;
        },
        querySelector(sel: string) {
            return makeSlot(sel);
        },
    };
    return {
        container: container as unknown as HTMLElement,
        allHtml: () =>
            shell
            + [...slots.values()]
                .map(s => s.html)
                .join(''),
    };
}

function makeServiceMember() {
    return new ServiceMember(
        {
            id: 'svc_1',
            name: 'CI bot',
            description: 'Builds every commit',
        },
        responseMessage<MembershipEntity>({
            id: 'svc_1',
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            identity_id: 'svc_1',
            type: 'member',
            state: 'accepted',
            at: '2026-01-01T00:00:00.000000Z',
        }),
    );
}

const REMOVABLE: SeatRemoval = {
    removable: true, isSelf: false,
};

Deno.test(
    'service member detail shows its name, description,'
    + ' identity link, Edit, and Remove',
    () => {
        const rec = makeRecordingContainer();
        new ServiceMemberDetailPresenter(
            makeServiceMember(), REMOVABLE,
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /CI bot/);
        assertMatch(out, /Builds every commit/);
        assertStrictEquals(
            out.includes(
                'href="' + buildPageUrl(
                    'identity-detail', { identityId: 'svc_1' },
                ) + '"',
            ),
            true,
        );
        assertMatch(out, /id="member-edit-btn"/);
        assertMatch(out, /data-dialog-open="confirm-remove"/);
    },
);

Deno.test(
    'service member edit mode shows Name and Description'
    + ' fields',
    () => {
        const rec = makeRecordingContainer();
        const member = makeServiceMember();
        new ServiceMemberDetailEditPresenter(
            member,
            serviceMemberDraftFromMember(member),
        ).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /value="CI bot"/);
        assertMatch(out, />Builds every commit<\/textarea>/);
        assertMatch(out, /id="member-cancel-btn"/);
        assertStrictEquals(
            out.includes('member-remove-btn'), false,
        );
    },
);
