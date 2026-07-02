import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    organizationSwitcherHtml,
} from '../web-app/app/organization-switcher.ts';

const TWO = [
    { id: '1', name: 'Stark' },
    { id: '2', name: 'Wayne' },
];

test('organizationSwitcherHtml renders a set-as-default control', () => {
    const out = organizationSwitcherHtml(TWO).toString();
    assert.match(out, /class="org-set-default"/);
    assert.match(out, /Set as default/);
});

test('organizationSwitcherHtml renders an option per org', () => {
    const out = organizationSwitcherHtml(TWO).toString();
    assert.match(out, /value="1"/);
    assert.match(out, /value="2"/);
});

test('organizationSwitcherHtml is empty below two orgs', () => {
    assert.equal(
        organizationSwitcherHtml([{ id: '1', name: 'Stark' }])
            .toString(),
        '');
});
