import { assertMatch, assertStrictEquals } from '@std/assert';
import {
    organizationSwitcherHtml,
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
