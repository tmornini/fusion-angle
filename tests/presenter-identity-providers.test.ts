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
    IdentityProvidersPresenter,
} = await import(
    '../web-app/app/presenters/identity-providers.ts'
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

test('renders a row per provider event', () => {
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
    assert.match(out, /google/);
    assert.match(out, /g-1/);
    assert.match(out, /linked/);
    assert.match(out, /unlinked/);
});

test('renders an empty state when no events', () => {
    const rec = record();
    new IdentityProvidersPresenter([])
        .render(rec.container);
    assert.match(rec.html(), /No linked providers/);
});
