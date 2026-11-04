import { assertMatch, assertNotMatch,
    assertStrictEquals } from '@std/assert';
import {
    commitDefaultOrganization,
    defaultOrganizationSelectHtml,
    readDefaultOrganizationField,
} from '../web-app/app/default-organization-field.ts';

const STARK = {
    id: 'AjdvjuECVZEgZoFajaIEkg',
    name: 'Stark',
};
const WAYNE = {
    id: 'BBjWJsjYIDkTRKIIPrzWRw',
    name: 'Wayne',
};
const TWO = [STARK, WAYNE];

Deno.test(
    'the default select lists each organization',
    () => {
        const out = defaultOrganizationSelectHtml(
            TWO,
            WAYNE.id,
        ).toString();
        assertMatch(out, /class="card p-6"/);
        assertMatch(out, />Default organization</);
        assertMatch(
            out,
            /id="default-organization"/,
        );
        assertMatch(
            out,
            /aria-label="Default organization"/,
        );
        assertMatch(out, /class="input"/);
        assertMatch(
            out,
            /data-previous="BBjWJsjYIDkTRKIIPrzWRw"/,
        );
        assertMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg">Stark/,
        );
        assertMatch(
            out,
            /value="BBjWJsjYIDkTRKIIPrzWRw" selected/,
        );
        assertNotMatch(out, /value=""/);
        assertNotMatch(
            out,
            /Choose a default organization/,
        );
        assertStrictEquals(
            out.includes('org-switcher'),
            false,
        );
    },
);

Deno.test(
    'the default menu draws its mark one space in',
    () => {
        const css = Deno.readTextFileSync(
            'web-app/app/styles/components-inputs.css',
        );
        const rule = css.slice(
            css.indexOf('#default-organization {'),
            css.indexOf('.input::placeholder'),
        );
        const field = css.slice(
            css.indexOf('.input {'),
            css.indexOf('#default-organization {'),
        );
        assertStrictEquals(
            rule.includes('appearance: none'),
            true,
        );
        assertStrictEquals(
            rule.includes('right var(--space-2) center'),
            true,
        );
        assertStrictEquals(
            rule.includes(
                'padding-inline-end:'
                    + ' calc(var(--space-2) * 4)',
            ),
            true,
        );
        assertStrictEquals(
            field.includes('appearance: none'),
            false,
        );
    },
);

Deno.test(
    'a null default selects no organization',
    () => {
        const out = defaultOrganizationSelectHtml(
            TWO,
            null,
        ).toString();
        assertMatch(out, /data-previous=""/);
        assertNotMatch(out, /selected/);
        assertNotMatch(
            out,
            /Choose a default organization/,
        );
        assertNotMatch(out, /disabled/);
    },
);

Deno.test(
    'one organization is the only option',
    () => {
        const out = defaultOrganizationSelectHtml(
            [STARK],
            STARK.id,
        ).toString();
        assertMatch(
            out,
            /value="AjdvjuECVZEgZoFajaIEkg" selected/,
        );
        assertNotMatch(out, /value=""/);
        assertNotMatch(out, /disabled/);
    },
);

Deno.test(
    'no organizations disables the menu',
    () => {
        const out = defaultOrganizationSelectHtml(
            [],
            null,
        ).toString();
        assertMatch(out, /<select[^>]*disabled/);
        assertMatch(
            out,
            /<option value="" disabled>/,
        );
        assertMatch(
            out,
            /no active organization memberships/,
        );
        assertNotMatch(out, /Stark/);
    },
);

const PAGE = 'pnXmXrxOWayANgDLdCjuBw';
const OTHER = 'syWUUcdBSbBgMwBiCrgbDw';

Deno.test(
    'another identity gets no default field',
    async () => {
        let calls = 0;
        const out = await readDefaultOrganizationField(
            OTHER,
            PAGE,
            () => {
                calls += 1;
                return Promise.resolve(TWO);
            },
            () => {
                calls += 1;
                return Promise.resolve(STARK.id);
            },
            () => {
                calls += 1;
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(calls, 0);
    },
);

Deno.test(
    'a failed organization read omits the field',
    async () => {
        const seen: unknown[] = [];
        let storedCalls = 0;
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.reject(
                new Error('organizations failed'),
            ),
            () => {
                storedCalls += 1;
                return Promise.resolve(null);
            },
            err => {
                seen.push(err);
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(storedCalls, 0);
        assertStrictEquals(seen.length, 1);
        const organizationErr = seen[0];
        if (!(organizationErr instanceof Error)) {
            throw new Error('expected an Error');
        }
        assertStrictEquals(
            organizationErr.message,
            'organizations failed',
        );
    },
);

Deno.test(
    'a failed default read omits the field',
    async () => {
        const seen: unknown[] = [];
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.reject(
                new Error('default failed'),
            ),
            err => {
                seen.push(err);
            },
        );
        assertStrictEquals(out.toString(), '');
        assertStrictEquals(seen.length, 1);
        const defaultErr = seen[0];
        if (!(defaultErr instanceof Error)) {
            throw new Error('expected an Error');
        }
        assertStrictEquals(
            defaultErr.message,
            'default failed',
        );
    },
);

Deno.test(
    'a null stored default selects no organization',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.resolve(null),
            () => {
                throw new Error('warn was called');
            },
        );
        assertNotMatch(out.toString(), /selected/);
        assertNotMatch(
            out.toString(),
            /Choose a default organization/,
        );
    },
);

Deno.test(
    'a stored id is selected for the session identity',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve(TWO),
            () => Promise.resolve(STARK.id),
            () => {
                throw new Error('warn was called');
            },
        );
        assertMatch(
            out.toString(),
            /value="AjdvjuECVZEgZoFajaIEkg" selected/,
        );
    },
);

Deno.test(
    'one organization is listed for the session identity',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve([STARK]),
            () => Promise.resolve(STARK.id),
            () => {
                throw new Error('warn was called');
            },
        );
        assertMatch(
            out.toString(),
            /value="AjdvjuECVZEgZoFajaIEkg" selected/,
        );
        assertNotMatch(out.toString(), /value=""/);
    },
);

Deno.test(
    'no organizations disables the session field',
    async () => {
        const out = await readDefaultOrganizationField(
            PAGE,
            PAGE,
            () => Promise.resolve([]),
            () => Promise.resolve(null),
            () => {
                throw new Error('warn was called');
            },
        );
        assertMatch(out.toString(), /disabled/);
        assertMatch(
            out.toString(),
            /no active organization memberships/,
        );
    },
);

import {
    ACTIVE_ORGANIZATION_ID,
} from '../client/organization-session.ts';

interface FakeSelect {
    value: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
}

function fakeSelect(
    value: string,
    previous: string,
): FakeSelect & { readonly attrs: Map<string, string> } {
    const attrs = new Map<string, string>([
        ['data-previous', previous],
    ]);
    return {
        value,
        attrs,
        getAttribute(name: string): string | null {
            return attrs.get(name) ?? null;
        },
        setAttribute(name: string, next: string): void {
            attrs.set(name, next);
        },
    };
}

Deno.test(
    'a default change writes and keeps the value',
    async () => {
        const select = fakeSelect(WAYNE.id, STARK.id);
        const puts: string[] = [];
        const toasts: string[] = [];
        localStorage.setItem(
            ACTIVE_ORGANIZATION_ID, 'KEEP',
        );
        await commitDefaultOrganization(
            select,
            async organization => {
                puts.push(organization);
            },
            (message, tone) => {
                toasts.push(tone + ':' + message);
            },
        );
        assertStrictEquals(puts.join(','), WAYNE.id);
        assertStrictEquals(select.value, WAYNE.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            WAYNE.id,
        );
        assertStrictEquals(
            toasts.join('|'),
            'success:Set as your default organization.',
        );
        assertStrictEquals(
            localStorage.getItem(
                ACTIVE_ORGANIZATION_ID,
            ),
            'KEEP',
        );
    },
);

Deno.test(
    'a failed default write restores and toasts',
    async () => {
        const select = fakeSelect(WAYNE.id, STARK.id);
        const toasts: string[] = [];
        await commitDefaultOrganization(
            select,
            () => Promise.reject(new Error('put failed')),
            (message, tone) => {
                toasts.push(tone + ':' + message);
            },
        );
        assertStrictEquals(select.value, STARK.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            STARK.id,
        );
        assertStrictEquals(
            toasts.join('|'),
            'error:Could not set the default organization.',
        );
    },
);

Deno.test(
    'the placeholder does not write',
    async () => {
        const select = fakeSelect('', STARK.id);
        let puts = 0;
        let toasts = 0;
        await commitDefaultOrganization(
            select,
            () => {
                puts += 1;
                return Promise.resolve();
            },
            () => {
                toasts += 1;
            },
        );
        assertStrictEquals(puts, 0);
        assertStrictEquals(toasts, 0);
        assertStrictEquals(select.value, STARK.id);
        assertStrictEquals(
            `${select.getAttribute('data-previous')}`,
            STARK.id,
        );
    },
);

Deno.test(
    'the default field does not switch or reload',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/default-organization-field.ts',
        );
        assertStrictEquals(
            src.includes('ACTIVE_ORGANIZATION_ID'),
            false,
        );
        assertStrictEquals(
            src.includes('putPreference'),
            false,
        );
        assertStrictEquals(
            src.includes('reload'),
            false,
        );
        assertStrictEquals(
            src.includes('location'),
            false,
        );
    },
);
