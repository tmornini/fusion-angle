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
    IdentityRosterPresenter,
} = await import(
    '../web-app/app/presenters/identity-list.ts'
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

test('person row shows name, email, and Person badge',
() => {
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'p1', kind: 'person',
            pii: {
                erased: false, name: 'Ada',
                email: 'ada@x.io', phone: '1', bio: 'b',
            },
        },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, /data-identity-id="p1"/);
    assert.match(out, /card card-hover/);
    assert.match(out, /Ada/);
    assert.match(out, /ada@x\.io/);
    assert.match(out, /Person/);
});

test('named service shows its name and detail, not the id',
() => {
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 's1', kind: 'service',
            service: {
                named: true, name: 'Grok 4.3',
                detail: 'Fast reasoning model',
            },
        },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, /data-identity-id="s1"/);
    assert.match(out, /Service/);
    assert.match(out, /Grok 4\.3/);
    assert.match(out, /Fast reasoning model/);
});

test('unnamed service redacts to a label, not the id',
async () => {
    const { UNNAMED_SERVICE_NAME } = await import(
        '../web-app/app/adapters/identities.ts'
    );
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: '42vHYDCvtkaO3sTnoqg7aJ',
            kind: 'service',
            service: { named: false },
        },
    ]).render(rec.container);
    const out = rec.html();
    assert.match(out, new RegExp(UNNAMED_SERVICE_NAME));
    assert.doesNotMatch(
        out, />\s*42vHYDCvtkaO3sTnoqg7aJ\s*</,
    );
});

test('erased person falls back to the named constant',
async () => {
    const { IDENTITY_WITHOUT_PII_NAME } = await import(
        '../web-app/app/adapters/identities.ts'
    );
    const rec = record();
    new IdentityRosterPresenter([
        {
            id: 'p2', kind: 'person',
            pii: { erased: true },
        },
    ]).render(rec.container);
    assert.match(
        rec.html(), new RegExp(IDENTITY_WITHOUT_PII_NAME),
    );
});

test('renders an empty state when no identities', () => {
    const rec = record();
    new IdentityRosterPresenter([]).render(rec.container);
    assert.match(rec.html(), /No identities/);
});
