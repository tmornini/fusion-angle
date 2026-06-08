import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    stateBadge,
} from '../web-app/app/presenters/state-badge.ts';
import { html } from '../web-app/app/safe-html.ts';

test('stateBadge renders state, class, label, dimmed', () => {
    const out = stateBadge(
        'active',
        { className: 'badge-success', label: 'Active' },
        () => html`<svg></svg>`,
        false,
    ).toString();
    assert.match(out, /data-state="active"/);
    assert.match(out, /badge-success/);
    assert.match(out, /data-dimmed="true"/);
    assert.match(out, /Active/);
});

test('stateBadge dims false when active or unfiltered', () => {
    const cfg = { className: 'c', label: 'L' };
    const icon = () => html``;
    assert.match(
        stateBadge('x', cfg, icon, true).toString(),
        /data-dimmed="false"/);
    assert.match(
        stateBadge('x', cfg, icon, null).toString(),
        /data-dimmed="false"/);
});
