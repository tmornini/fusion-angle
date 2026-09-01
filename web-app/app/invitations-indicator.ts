import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

// Wire the click + change subscription exactly once per page load
// (module state resets on every full-page navigation), so re-renders
// driven by the change channel never stack a second click handler.
let wired = false;

// The top-bar pending-invitations indicator. Shown ONLY when the
// caller has one or more pending invitations — an honest affordance,
// never an empty bell. The count rides a badge over the bell;
// clicking opens the invitations page. The read is identity-scoped
// (the invitation facade fences by the caller), so it works even for
// a member with no admin role. It OBSERVES the invitation change
// channel, so accepting/declining on the invitations page updates the
// count without a reload (the Observer article — trust the bell).
export async function mutateInvitationsBell(
): Promise<void> {
    const bell = $('#invitations-bell', document);
    const badge = $('#invitations-badge', document);
    if (!bell) return;
    if (!wired) {
        wired = true;
        bell.addEventListener(
            'click', () => navigateTo('invitations'));
        const { subscribeInvitationChanges } =
            await import('./adapters/index.ts');
        subscribeInvitationChanges(
            () => void renderBell(bell, badge));
    }
    await renderBell(bell, badge);
}

async function renderBell(
    bell: HTMLElement,
    badge: HTMLElement | null,
): Promise<void> {
    const { sessionContext, getInvitations } =
        await import('./adapters/index.ts');
    const pending = (await getInvitations(sessionContext()))
        .filter(inv => inv.state === 'pending');
    if (pending.length === 0) {
        bell.classList.add('hidden');
        if (badge) badge.textContent = '';
        return;
    }
    if (badge) badge.textContent = String(pending.length);
    bell.classList.remove('hidden');
}
