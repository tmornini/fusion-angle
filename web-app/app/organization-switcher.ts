import { html, type SafeHtml } from './safe-html.ts';
import { $, $$, $select } from './dom.ts';
import {
    shouldShowOrganizationSwitcher,
    ACTIVE_ORGANIZATION_KEY,
} from './adapters/organization-session.ts';
import { putPreference } from './adapters/preferences.ts';
import { showToast } from './toast.ts';

interface OrganizationOption {
    readonly id: string;
    readonly name: string;
}

// The org `<select>` plus a "Set as default" button — empty
// unless there are two or more reachable orgs (an honest
// affordance only with a real choice). The active org is
// selected after render in wireOrganizationSwitcher, so options carry no
// `selected` attribute.
export function organizationSwitcherHtml(
    organizations: readonly OrganizationOption[],
): SafeHtml {
    if (!shouldShowOrganizationSwitcher(organizations)) return html``;
    const options = organizations.map(o =>
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
function switchToOrganization(organization: string): void {
    if (!putPreference(ACTIVE_ORGANIZATION_KEY, organization)) {
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
export function wireOrganizationSwitcher(activeOrganizationId: string): void {
    const groups = $$('.org-switcher-group', document);
    for (const group of groups) {
        const select = $select('.org-switcher', group);
        if (select === null) continue;
        select.value = activeOrganizationId;
        select.addEventListener('change', () => {
            switchToOrganization(select.value);
        });
        const setDefault = $('.org-set-default', group);
        setDefault?.addEventListener('click', () => {
            void setActiveOrganizationAsDefault(select.value);
        });
    }
}

// Persist the active org as the identity's default. The session
// is org-scoped post-boot, so the chosen org is always one of
// the caller's memberships — the server fence never trips here.
async function setActiveOrganizationAsDefault(
    organization: string,
): Promise<void> {
    const { sessionContext } =
        await import('./adapters/shared.ts');
    const { putIdentityDefaultOrganization } =
        await import('./adapters/identity-default-organization.ts');
    await putIdentityDefaultOrganization(sessionContext(), organization);
    showToast(
        'Set as your default organization.', 'success');
}
