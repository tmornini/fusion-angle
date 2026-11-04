import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    organizationSwitcherHtml,
    urlAfterOrganizationSwitch,
} from '../web-app/app/organization-switcher.ts';

const TWO = [
    { id: 'AjdvjuECVZEgZoFajaIEkg', name: 'Stark' },
    { id: 'BBjWJsjYIDkTRKIIPrzWRw', name: 'Wayne' },
];

Deno.test(
    'organizationSwitcherHtml renders the switcher',
    () => {
        const out = organizationSwitcherHtml(TWO)
            .toString();
        assertMatch(out, /class="org-switcher"/);
        assertMatch(
            out,
            /aria-label="Switch organization"/,
        );
        assertStrictEquals(
            out.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            out.includes('Set as default'),
            false,
        );
        assertStrictEquals(
            out.includes('org-switcher-group'),
            false,
        );
    },
);

Deno.test(
    'the switcher module does not set a default',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/organization-switcher.ts',
        );
        assertStrictEquals(
            src.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            src.includes('Set as default'),
            false,
        );
        assertStrictEquals(
            src.includes(
                'putIdentityDefaultOrganization',
            ),
            false,
        );
        assertMatch(src, /\$\$\('\.org-switcher'/);
        const css = Deno.readTextFileSync(
            'web-app/app/styles/'
            + 'components-organization-switcher.css',
        );
        assertStrictEquals(
            css.includes('org-set-default'),
            false,
        );
        assertStrictEquals(
            css.includes('org-switcher-group'),
            false,
        );
    },
);

Deno.test('organizationSwitcherHtml renders an option per org', () => {
    const out = organizationSwitcherHtml(TWO).toString();
    assertMatch(out, /value="AjdvjuECVZEgZoFajaIEkg"/);
    assertMatch(out, /value="BBjWJsjYIDkTRKIIPrzWRw"/);
});

Deno.test('organizationSwitcherHtml is empty below two orgs', () => {
    assertStrictEquals(
        organizationSwitcherHtml([{ id: 'AjdvjuECVZEgZoFajaIEkg'
            , name: 'Stark' }])
            .toString(),
        '');
});

Deno.test(
    'a switch off convert leaves the ideas'
    + ' index (D16)',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/convert.html'
                + '?ideaId=WurwPqXxGtLhRAoCEcPzfQ'
                + '#stay',
            ),
            '/ideas/index.html',
        );
    },
);

Deno.test(
    'a switch on the ideas index keeps its query',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/index.html?x=1',
            ),
            '/ideas/index.html?x=1',
        );
    },
);

Deno.test(
    'a switch on idea detail keeps its ideaId',
    () => {
        assertStrictEquals(
            urlAfterOrganizationSwitch(
                'http://local/ideas/detail.html'
                + '?ideaId=999',
            ),
            '/ideas/detail.html?ideaId=999',
        );
    },
);
