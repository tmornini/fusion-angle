// state.ts (transitively imported via core.ts ->
// presenters) reads localStorage and window /
// document at module-eval time, which Node lacks.
// Stub before any import, then load presenter
// modules with dynamic import() so the stubs are
// in place. Same pattern as presenter-member-detail.
// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error - Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error - Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { Identity } = await import('../api/types.ts');
const { ERASED_MEMBER_NAME } = await import(
    '../web-app/app/adapters/members-union.ts'
);

const {
    IdentityDetailPresenter,
} = await import(
    '../web-app/app/presenters/identity-detail.ts'
);

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

function personPresenter() {
    return new IdentityDetailPresenter({
        identity: new Identity({
            id: 'p1', kind: 'person',
        }),
        pii: {
            erased: false,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '555-0100',
            bio: 'First programmer.',
        },
        activeCredentialKinds: [],
    });
}

test(
    'person detail renders id, Person badge, and'
    + ' personal-info fields',
    () => {
        const rec = makeRecordingContainer();
        personPresenter().renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /p1/);
        assert.match(out, /Person/);
        assert.match(out, /Personal Information/);
        assert.match(out, /Ada Lovelace/);
        assert.match(out, /ada@example\.com/);
        assert.match(out, /555-0100/);
        assert.match(out, /First programmer\./);
        // Back affordance present
        assert.match(
            out, /data-identity-action="back"/,
        );
        // Links to providers and tokens views
        assert.match(out, /data-identity-link="providers"/);
        assert.match(out, /data-identity-link="tokens"/);
    },
);

test(
    'erased person shows ERASED_MEMBER_NAME and the'
    + ' absent marker for the blanked fields',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'p2', kind: 'person',
            }),
            pii: { erased: true },
            activeCredentialKinds: [],
        }).renderShell(rec.container);
        const out = rec.allHtml();
        // The call site supplies the named-constant
        // fallback (no bare literal in the presenter).
        assert.match(out, new RegExp(ERASED_MEMBER_NAME));
        assert.match(out, /—/);
    },
);

test(
    'service detail renders Service badge and the'
    + ' active credential summary, never the secret',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 's1', kind: 'service',
            }),
            pii: { erased: true },
            activeCredentialKinds: ['client_secret'],
        }).renderShell(rec.container);
        const out = rec.allHtml();
        assert.match(out, /Service/);
        assert.match(out, /Credentials/);
        assert.match(out, /client_secret/);
        // The secret value never appears.
        assert.equal(out.includes('secret-v'), false);
        // No personal-info card for a service.
        assert.equal(
            out.includes('Personal Information'), false,
        );
    },
);
