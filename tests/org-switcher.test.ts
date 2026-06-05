import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { orgSwitcherHtml } from '../web-app/app/org-switcher.ts';

const TWO = [
    { id: '1', name: 'Stark' },
    { id: '2', name: 'Wayne' },
];

test('orgSwitcherHtml renders a set-as-default control', () => {
    const out = orgSwitcherHtml(TWO).toString();
    assert.match(out, /class="org-set-default"/);
    assert.match(out, /Set as default/);
});

test('orgSwitcherHtml renders an option per org', () => {
    const out = orgSwitcherHtml(TWO).toString();
    assert.match(out, /value="1"/);
    assert.match(out, /value="2"/);
});

test('orgSwitcherHtml is empty below two orgs', () => {
    assert.equal(
        orgSwitcherHtml([{ id: '1', name: 'Stark' }])
            .toString(),
        '');
});
