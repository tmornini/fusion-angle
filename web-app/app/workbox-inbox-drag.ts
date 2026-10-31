import type { InboxListKind } from
    './presenters/workbox-inbox.ts';

export type InboxDropDestination =
    | InboxListKind
    | 'outside';

export type InboxDropAction =
    | 'claim'
    | 'release'
    | 'reorder'
    | 'none';

export function inboxListKindFromHash(
    hash: string,
): 'claimed' | 'archivedByMe' {
    return hash === '#archived'
        ? 'archivedByMe'
        : 'claimed';
}

export function classifyInboxDrop(
    source: InboxListKind,
    destination: InboxDropDestination,
    rightListKind: 'claimed' | 'archivedByMe',
): InboxDropAction {
    if (rightListKind === 'archivedByMe') {
        return 'none';
    }
    if (
        destination === 'outside'
        || destination === 'archivedByMe'
        || source === 'archivedByMe'
    ) {
        return 'none';
    }
    if (
        source === 'available'
        && destination === 'claimed'
    ) {
        return 'claim';
    }
    if (
        source === 'claimed'
        && destination === 'available'
    ) {
        return 'release';
    }
    if (
        source === 'claimed'
        && destination === 'claimed'
    ) {
        return 'reorder';
    }
    return 'none';
}
