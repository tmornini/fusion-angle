import { assertMatch } from '@std/assert';
import {
    IdentityProvidersPresenter,
} from '../web-app/app/presenters/identity-providers.ts';

// identity-providers.ts never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because IdentityProvidersPresenter.render walks
// a real DOM element.
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

Deno.test('renders a row per provider event', () => {
    const rec = record();
    new IdentityProvidersPresenter([
        {
            provider: 'google', providerSubject: 'g-1',
            action: 'linked',
            at: '2026-01-01T00:00:00.000000Z',
        },
        {
            provider: 'google', providerSubject: 'g-1',
            action: 'unlinked',
            at: '2026-01-02T00:00:00.000000Z',
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /google/);
    assertMatch(out, /g-1/);
    assertMatch(out, /linked/);
    assertMatch(out, /unlinked/);
});

Deno.test('renders an empty state when no events', () => {
    const rec = record();
    new IdentityProvidersPresenter([])
        .render(rec.container);
    assertMatch(rec.html(), /No linked providers/);
});
