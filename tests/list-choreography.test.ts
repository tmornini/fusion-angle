import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import {
    buildStateFilterBadges,
    filteredSortedList,
} from '../web-app/app/presenters/list-choreography.ts';
import { html } from '../web-app/app/safe-html.ts';

const badge = (
    item: { g: string },
    active: boolean | null,
) => html`<b data-g="${item.g}" data-a="${
    String(active)
}"></b>`;

Deno.test('buildStateFilterBadges renders present groups in order',
    () => {
        const items = [{ g: 'x' }, { g: 'y' }, { g: 'x' }];
        const out = buildStateFilterBadges(
            items, i => i.g, ['y', 'x'], null, badge,
        ).toString();
        assertMatch(out, /data-g="y"[\s\S]*data-g="x"/);
    });

Deno.test('buildStateFilterBadges marks the active group', () => {
    const items = [{ g: 'x' }, { g: 'y' }];
    const out = buildStateFilterBadges(
        items, i => i.g, ['x', 'y'], 'y', badge,
    ).toString();
    assertMatch(out, /data-g="x" data-a="false"/);
    assertMatch(out, /data-g="y" data-a="true"/);
});

Deno.test('buildStateFilterBadges omits groups outside order',
    () => {
        const items = [
            { g: 'x' }, { g: 'promoted' }, { g: 'y' },
        ];
        const out = buildStateFilterBadges(
            items, i => i.g, ['x', 'y'], null, badge,
        ).toString();
        assertMatch(out, /data-g="x"/);
        assertMatch(out, /data-g="y"/);
        assert(!out.includes('data-g="promoted"'));
    });

Deno.test('filteredSortedList filters, sorts, then renders', () => {
    const items = [{ n: 3, s: 'b' }, { n: 1, s: 'a' },
        { n: 2, s: 'b' }];
    const out = filteredSortedList(
        items,
        { kind: 'filtered', status: 'b' },
        (i, status) => i.s === status,
        arr => [...arr].sort((a, b) => a.n - b.n),
        i => html`<i>${String(i.n)}</i>`,
    ).toString();
    assertStrictEquals(out, '<i>2</i><i>3</i>');
});

Deno.test('filteredSortedList renders all when the filter is all',
    () => {
        const items = [{ n: 2, s: 'a' }, { n: 1, s: 'a' }];
        const out = filteredSortedList(
            items,
            { kind: 'all' },
            (i, status) => i.s === status,
            arr => [...arr].sort((a, b) => a.n - b.n),
            i => html`<i>${String(i.n)}</i>`,
        ).toString();
        assertStrictEquals(out, '<i>1</i><i>2</i>');
    });
