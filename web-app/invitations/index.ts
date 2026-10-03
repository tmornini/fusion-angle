import { $required } from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { extractErrorMessage } from '../app/error-helpers.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    getInvitations,
    postInvitationAcceptance,
    postInvitationDecline,
    subscribeInvitationChanges,
    type InvitationView,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    InvitationListPresenter,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

let listEl: HTMLElement | null = null;
let pending: InvitationView[] = [];

export async function init(): Promise<void> {
    const container = $required(
        '#invitations-list', document,
    );
    listEl = container;
    await loadInto({
        container,
        skeleton: buildSkeleton('table', 3),
        fetch: () => getInvitations(
            sessionContext(), 'pending',
        ),
        retry: init,
        onData: loaded => {
            pending = loaded;
            rerender();
            container.addEventListener(
                'click', onListClick, { signal });
            subscribeInvitationChanges(
                () => void refresh(),
            );
        },
    });
}

function rerender(): void {
    if (!listEl) return;
    new InvitationListPresenter(pending).render(listEl);
}

async function refresh(): Promise<void> {
    if (!listEl) return;
    pending = await getInvitations(
        sessionContext(), 'pending',
    );
    rerender();
}

async function onListClick(e: MouseEvent): Promise<void> {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest('[data-invitation-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-invitation-action');
    const id = target
        .closest('[data-invitation-id]')
        ?.getAttribute('data-invitation-id');
    if (!id) return;
    const invitation = pending.find(
        inv => inv.id === id,
    );
    if (invitation === undefined) return;
    try {
        if (action === 'accept') {
            await postInvitationAcceptance(
                sessionContext(), invitation,
            );
            showToast('Invitation accepted', 'success');
        } else if (action === 'decline') {
            await postInvitationDecline(
                sessionContext(), invitation,
            );
            showToast('Invitation declined', 'success');
        } else {
            return;
        }
    } catch (err) {
        log.error(
            'invitation action failed', 'invitations', err);
        showToast(
            'Failed: ' + extractErrorMessage(err), 'error');
    }
    // The list re-renders via the change subscription the post*
    // adapters notify — no explicit refresh, no double read.
}
