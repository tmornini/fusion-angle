import { assertMatch, assertNotMatch, assertStrictEquals } from '@std/assert';
import { Identity } from '../api/types.ts';
import {
    IDENTITY_WITHOUT_PII_NAME,
    UNNAMED_SERVICE_NAME,
} from '../web-app/app/adapters/identities.ts';
import {
    IdentityDetailPresenter,
} from '../web-app/app/presenters/identity-detail.ts';

// Neither adapters/identities.ts nor
// presenters/identity-detail.ts reads localStorage
// (checked against the full product tree); window/
// document are stubbed because IdentityDetailPresenter
// walks a real DOM tree via renderShell/mutateSlot.
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

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
            id: 'pnXmXrxOWayANgDLdCjuBw', kind: 'person',
        }),
        pii: {
            erased: false,
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '555-0100',
            bio: 'First programmer.',
        },
        service: { named: false },
        activeCredentialKinds: [],
        registration: { registered: false as const },
    });
}

Deno.test(
    'person detail renders id, Person badge, and'
    + ' personal-info fields',
    () => {
        const rec = makeRecordingContainer();
        personPresenter().renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /pnXmXrxOWayANgDLdCjuBw/);
        assertMatch(out, /Person/);
        assertMatch(out, /Personal Information/);
        assertMatch(out, /Ada Lovelace/);
        assertMatch(out, /ada@example\.com/);
        assertMatch(out, /555-0100/);
        assertMatch(out, /First programmer\./);
        // Back affordance present
        assertMatch(
            out, /data-identity-action="back"/,
        );
        // Links to providers and tokens views
        assertMatch(out, /data-identity-link="providers"/);
        assertMatch(out, /data-identity-link="tokens"/);
    },
);

Deno.test(
    'erased person shows IDENTITY_WITHOUT_PII_NAME and the'
    + ' absent marker for the blanked fields',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'prBESZPjJDiuXCeZLmbiVw', kind: 'person',
            }),
            pii: { erased: true },
            service: { named: false },
            activeCredentialKinds: [],
            registration: { registered: false as const },
        }).renderShell(rec.container);
        const out = rec.allHtml();
        // The call site supplies the named-constant
        // fallback (no bare literal in the presenter).
        assertMatch(out, new RegExp(IDENTITY_WITHOUT_PII_NAME));
        assertMatch(out, /—/);
    },
);

Deno.test(
    'named service detail shows its name and Service'
    + ' badge, never the secret',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'syWUUcdBSbBgMwBiCrgbDw', kind: 'service',
            }),
            pii: { erased: true },
            service: {
                named: true, name: 'Grok 4.3',
                detail: 'Fast reasoning model',
            },
            activeCredentialKinds: ['client_secret'],
            registration: { registered: false as const },
        }).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, /Grok 4\.3/);
        assertMatch(out, /Service/);
        assertMatch(out, /Credentials/);
        assertMatch(out, /client_secret/);
        // The secret value never appears.
        assertStrictEquals(out.includes('secret-v'), false);
        // No personal-info card for a service.
        assertStrictEquals(
            out.includes('Personal Information'), false,
        );
        // It is not redacted as an unknown member.
        assertStrictEquals(
            out.includes(IDENTITY_WITHOUT_PII_NAME), false,
        );
    },
);

Deno.test(
    'nameless service detail redacts to the service'
    + ' label, never the id as the title',
    () => {
        const rec = makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'BhdhBLQPyktOCbdJzGsggg',
                kind: 'service',
            }),
            pii: { erased: true },
            service: { named: false },
            activeCredentialKinds: ['client_secret'],
            registration: { registered: false as const },
        }).renderShell(rec.container);
        const out = rec.allHtml();
        assertMatch(out, new RegExp(UNNAMED_SERVICE_NAME));
        // The id is the subtitle, never the heading.
        assertNotMatch(
            out, /<h1[^>]*>\s*BhdhBLQPyktOCbdJzGsggg/,
        );
    },
);

Deno.test(
    'a service identity renders an unregistered'
    + ' registration card',
    () => {
        const { container, allHtml } =
            makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'syWUUcdBSbBgMwBiCrgbDw', kind: 'service',
            }),
            pii: { erased: true },
            service: { named: true, name: 'Robo',
                detail: 'bot' },
            activeCredentialKinds: [],
            registration: { registered: false },
        }).renderShell(container);
        assertMatch(allHtml(), /Client registration/);
        assertMatch(allHtml(), /Not registered\./);
        assertMatch(allHtml(), /Register client/);
    },
);

Deno.test(
    'a registered service renders status tone and fields',
    () => {
        const { container, allHtml } =
            makeRecordingContainer();
        new IdentityDetailPresenter({
            identity: new Identity({
                id: 'syWUUcdBSbBgMwBiCrgbDw', kind: 'service',
            }),
            pii: { erased: true },
            service: { named: true, name: 'Robo',
                detail: 'bot' },
            activeCredentialKinds: [],
            registration: {
                registered: true,
                grantTypes: 'client_credentials',
                redirectUris: '',
                jwks: '{"keys":[]}',
                aud: 'fusion-angle',
                status: 'active',
            },
        }).renderShell(container);
        assertMatch(allHtml(), /data-tone="success"/);
        assertMatch(allHtml(), /client_credentials/);
        assertMatch(allHtml(), /Manage registration/);
    },
);
