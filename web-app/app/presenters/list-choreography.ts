import { html, type SafeHtml } from '../safe-html.ts';
import { orderedKeys } from './ordered-keys.ts';
import type { StatusFilter } from './list-filter.ts';

// The list presenters' shared badge choreography: group the
// items by state, render one badge per present group in `order`,
// dimming groups that are not the active filter. The per-entity
// badge builder is injected, so each presenter keeps its own
// STATE config private — the process is shared, the participants
// vary. Free functions, never a base class.
export function buildStateFilterBadges<T, S extends string>(
    items: readonly T[],
    groupOf: (item: T) => S,
    order: readonly S[],
    active: S | null,
    buildBadge: (item: T, isActive: boolean | null) => SafeHtml,
): SafeHtml {
    const groups = Object.groupBy(items, groupOf);
    const badges = orderedKeys(groups, order)
        .map(s => ({ state: s, items: groups[s] }))
        .filter(g => g.items && g.items.length > 0)
        .map(g => buildBadge(
            g.items![0]!,
            active === null ? null : g.state === active,
        ));
    return html`${badges}`;
}

// The list presenters' shared list choreography: keep the items
// matching the active status filter (all when unfiltered), sort
// by the injected strategy, render each. matchesStatus, the
// sort, and the renderer are injected — composition.
export function filteredSortedList<T, S>(
    items: readonly T[],
    filter: StatusFilter<S>,
    matchesStatus: (item: T, status: S) => boolean,
    sort: (items: readonly T[]) => T[],
    render: (item: T) => SafeHtml,
): SafeHtml {
    const filtered = filter.kind === 'filtered'
        ? items.filter(i => matchesStatus(i, filter.status))
        : items;
    return html`${sort(filtered).map(render)}`;
}
