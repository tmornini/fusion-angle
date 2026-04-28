// Shared status-filter toggle for list
// presenters. Both idea and project list
// presenters carry the same shape:
// Filter<S> = { kind: 'all' }
//   | { kind: 'filtered'; status: S }
// and the same toggle behavior:
// clicking the active status returns all,
// otherwise filter to the clicked status.

export type StatusFilter<S> =
    | { kind: 'all' }
    | { kind: 'filtered'; status: S };

export function toggleStatusFilter<S>(
    current: StatusFilter<S>,
    status: S,
): StatusFilter<S> {
    return current.kind === 'filtered'
        && current.status === status
        ? { kind: 'all' }
        : { kind: 'filtered', status };
}
