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
    IdentityTokensPresenter,
} = await import(
    '../web-app/app/presenters/identity-tokens.ts'
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

test('renders a card per chain with each jti event', () => {
    const rec = record();
    new IdentityTokensPresenter([
        {
            chainId: 'c1',
            events: [
                {
                    jti: 'j1',
                    action: 'issued',
                    at: '2026-01-01T00:00:00.000000Z',
                },
                {
                    jti: 'j2', parentJti: 'j1',
                    action: 'rotated',
                    at: '2026-01-02T00:00:00.000000Z',
                },
            ],
        },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, /c1/);
    assert.match(out, /j1/);
    assert.match(out, /j2/);
    assert.match(out, /issued/);
    assert.match(out, /rotated/);
});

test('renders an empty state when no chains', () => {
    const rec = record();
    new IdentityTokensPresenter([])
        .render(rec.container);
    assert.match(rec.html(), /No tokens/);
});
