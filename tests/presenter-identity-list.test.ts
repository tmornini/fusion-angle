import { assertMatch, assertNotMatch } from '@std/assert';
import {
    IdentityRosterPresenter,
} from '../web-app/app/presenters/identity-list.ts';

// identity-list.ts never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because IdentityRosterPresenter.render walks a
// real DOM element.
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

Deno.test('person row shows name, email, and Person badge',
() => {
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'pnXmXrxOWayANgDLdCjuBw', kind: 'person',
            pii: {
                erased: false, name: 'Ada',
                email: 'ada@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
            },
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /data-identity-id="pnXmXrxOWayANgDLdCjuBw"/);
    assertMatch(out, /card card-hover/);
    assertMatch(out, /Ada/);
    assertMatch(out, /ada@x\.io/);
    assertMatch(out, /Person/);
});

Deno.test('named service shows its name and detail, not the id',
() => {
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'syWUUcdBSbBgMwBiCrgbDw', kind: 'service',
            service: {
                named: true, name: 'Grok 4.3',
                detail: 'Fast reasoning model',
            },
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /data-identity-id="syWUUcdBSbBgMwBiCrgbDw"/);
    assertMatch(out, /Service/);
    assertMatch(out, /Grok 4\.3/);
    assertMatch(out, /Fast reasoning model/);
});

Deno.test('unnamed service redacts to a label, not the id',
async () => {
    const { UNNAMED_SERVICE_NAME } = await import(
        '../web-app/app/adapters/identities.ts'
    );
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'BhdhBLQPyktOCbdJzGsggg',
            kind: 'service',
            service: { named: false },
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, new RegExp(UNNAMED_SERVICE_NAME));
    assertNotMatch(
        out, />\s*BhdhBLQPyktOCbdJzGsggg\s*</,
    );
});

Deno.test('erased person falls back to the named constant',
async () => {
    const { IDENTITY_WITHOUT_PII_NAME } = await import(
        '../web-app/app/adapters/identities.ts'
    );
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'prBESZPjJDiuXCeZLmbiVw', kind: 'person',
            pii: { erased: true },
        },
    ]).render(rec.container);
    assertMatch(
        rec.html(), new RegExp(IDENTITY_WITHOUT_PII_NAME),
    );
});

Deno.test('renders an empty state when no identities', () => {
    const rec = record();
    new IdentityRosterPresenter([]).render(rec.container);
    assertMatch(rec.html(), /No identities/);
});
