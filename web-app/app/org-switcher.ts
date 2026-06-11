import { html, type SafeHtml } from './safe-html.ts';
import { $, $$, $select } from './dom.ts';
import {
    shouldShowOrgSwitcher,
    ACTIVE_ORG_KEY,
} from './adapters/org-session.ts';
import { putPreference } from './adapters/preferences.ts';
import { showToast } from './toast.ts';

interface OrgOption {
    readonly id: string;
    readonly name: string;
}

// The org `<select>` plus a "Set as default" button — empty
// unless there are two or more reachable orgs (an honest
// affordance only with a real choice). The active org is
// selected after render in wireOrgSwitcher, so options carry no
// `selected` attribute.
export function orgSwitcherHtml(
    orgs: readonly OrgOption[],
): SafeHtml {
    if (!shouldShowOrgSwitcher(orgs)) return html``;
    const options = orgs.map(o =>
        html`<option value="${o.id}">${o.name}</option>`);
    return html`<span class="org-switcher-group"><select
        class="org-switcher"
        aria-label="Switch organization">${options}</select>
        <button type="button"
        class="org-set-default">Set as default</button></span>`;
}

// Persist the chosen org and re-scope via a FULL reload: boot
// re-exchanges a scoped token from the persisted id, so no
// mixed-org view can survive the switch. Reload only on a
// confirmed persist — a false return means the id never
// landed, so a reload would silently keep the prior org.
function switchToOrg(org: string): void {
    if (!putPreference(ACTIVE_ORG_KEY, org)) {
        showToast(
            'Could not switch organization —'
            + ' please try again.',
            'error',
        );
        return;
    }
    location.reload();
}

// Select the active org and wire each switcher group. The
// desktop and mobile sidebars each render one, so this wires
// EVERY `.org-switcher-group` rather than the first — both stay
// live and in sync after a switch.
export function wireOrgSwitcher(activeOrgId: string): void {
    const groups = $$('.org-switcher-group', document);
    for (const group of groups) {
        const select = $select('.org-switcher', group);
        if (select === null) continue;
        select.value = activeOrgId;
        select.addEventListener('change', () => {
            switchToOrg(select.value);
        });
        const setDefault = $('.org-set-default', group);
        setDefault?.addEventListener('click', () => {
            void setActiveOrgAsDefault(select.value);
        });
    }
}

// Persist the active org as the identity's default. The session
// is org-scoped post-boot, so the chosen org is always one of
// the caller's memberships — the server fence never trips here.
async function setActiveOrgAsDefault(
    org: string,
): Promise<void> {
    const { sessionContext } =
        await import('./adapters/shared.ts');
    const { putIdentityDefaultOrg } =
        await import('./adapters/identity-default-org.ts');
    await putIdentityDefaultOrg(sessionContext(), org);
    showToast(
        'Set as your default organization.', 'success');
}
