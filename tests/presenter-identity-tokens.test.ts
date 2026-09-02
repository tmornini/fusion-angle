import { assertMatch } from '@std/assert';
import {
    IdentityTokensPresenter,
} from '../web-app/app/presenters/identity-tokens.ts';

// identity-tokens.ts never reads localStorage (checked
// against the full product tree); window/document are
// stubbed because IdentityTokensPresenter.render walks a
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

Deno.test('renders a card per chain with each jti event', () => {
    const rec = record();
    new IdentityTokensPresenter([
        {
            chainId: 'WeXjAaAxGSpLpamfEuvcww',
            events: [
                {
                    jti: 'jmvogLnzTmiQlAkVvDHrvQ',
                    action: 'issued',
                    at: '2026-01-01T00:00:00.000000Z',
                },
                {
                    jti: 'j2', parentJti: 'jmvogLnzTmiQlAkVvDHrvQ',
                    action: 'rotated',
                    at: '2026-01-02T00:00:00.000000Z',
                },
            ],
        },
    ]).render(rec.container);
    const out = rec.html();
    assertMatch(out, /WeXjAaAxGSpLpamfEuvcww/);
    assertMatch(out, /jmvogLnzTmiQlAkVvDHrvQ/);
    assertMatch(out, /j2/);
    assertMatch(out, /issued/);
    assertMatch(out, /rotated/);
});

Deno.test('renders an empty state when no chains', () => {
    const rec = record();
    new IdentityTokensPresenter([])
        .render(rec.container);
    assertMatch(rec.html(), /No tokens/);
});
