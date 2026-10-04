import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    organizationSwitcherHtml,
    urlAfterOrganizationSwitch,
} from '../web-app/app/organization-switcher.ts';

const TWO = [
    { id: 'AjdvjuECVZEgZoFajaIEkg', name: 'Stark' },
    { id: 'BBjWJsjYIDkTRKIIPrzWRw', name: 'Wayne' },
];

Deno.test('organizationSwitcherHtml renders a set-as-default control', () => {
    const out = organizationSwitcherHtml(TWO).toString();
    assertMatch(out, /class="org-set-default"/);
    assertMatch(out, /Set as default/);
});

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
    'a switch on idea detail keeps its ideaId'
    + ' (D16)',
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
