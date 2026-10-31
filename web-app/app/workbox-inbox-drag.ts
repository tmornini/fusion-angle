import type { InboxListKind } from
    './presenters/workbox-inbox.ts';
import {
    deleteWorkOrderClaim,
    putWorkOrderClaim,
    putWorkOrderPosition,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';

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

export type InboxTransfer =
    | { kind: 'claim'; position: number }
    | { kind: 'release' }
    | { kind: 'reorder'; position: number }
    | { kind: 'none' };

export async function transferInboxDrop(
    ctx: RequestContext,
    held: WorkOrder,
    drop: InboxTransfer,
): Promise<WorkOrder> {
    if (drop.kind === 'none') {
        return held;
    }
    if (drop.kind === 'release') {
        return await deleteWorkOrderClaim(
            ctx, held,
        );
    }
    if (drop.kind === 'reorder') {
        return await putWorkOrderPosition(
            ctx, held, drop.position,
        );
    }
    const claimed = await putWorkOrderClaim(
        ctx, held,
    );
    return await putWorkOrderPosition(
        ctx, claimed, drop.position,
    );
}
