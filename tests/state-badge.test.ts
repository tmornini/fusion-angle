import { assertMatch } from '@std/assert';
import {
    stateBadge,
} from '../web-app/app/presenters/state-badge.ts';
import { html } from '../web-app/app/safe-html.ts';

Deno.test('stateBadge renders state, class, label, dimmed', () => {
    const out = stateBadge(
        'active',
        { className: 'badge-success', label: 'Active' },
        () => html`<svg></svg>`,
        false,
    ).toString();
    assertMatch(out, /^<button type="button"/);
    assertMatch(out, /data-state="active"/);
    assertMatch(out, /badge-success/);
    assertMatch(out, /data-dimmed="true"/);
    assertMatch(out, /aria-pressed="false"/);
    assertMatch(out, /Active/);
});

Deno.test('stateBadge dims false when active or unfiltered', () => {
    const cfg = { className: 'c', label: 'L' };
    const icon = () => html``;
    assertMatch(
        stateBadge('x', cfg, icon, true).toString(),
        /data-dimmed="false"/);
    assertMatch(
        stateBadge('x', cfg, icon, null).toString(),
        /data-dimmed="false"/);
});

Deno.test('stateBadge presses only the active filter chip', () => {
    const cfg = { className: 'c', label: 'L' };
    const icon = () => html``;
    assertMatch(
        stateBadge('x', cfg, icon, true).toString(),
        /aria-pressed="true"/);
    assertMatch(
        stateBadge('x', cfg, icon, false).toString(),
        /aria-pressed="false"/);
    assertMatch(
        stateBadge('x', cfg, icon, null).toString(),
        /aria-pressed="false"/);
});
