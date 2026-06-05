import { html, type SafeHtml } from './safe-html.ts';
import {
    shouldShowOrgSwitcher,
    ACTIVE_ORG_KEY,
} from './adapters/org-session.ts';
import { writePreference } from './adapters/preferences.ts';
import { showToast } from './toast.ts';

interface OrgOption {
    readonly id: string;
    readonly name: string;
}

// The org `<select>` markup — empty unless there are two or
// more reachable orgs (an honest affordance only with a real
// choice). The active org is selected after render in
// wireOrgSwitcher, so options carry no `selected` attribute.
export function orgSwitcherHtml(
    orgs: readonly OrgOption[],
): SafeHtml {
    if (!shouldShowOrgSwitcher(orgs)) return html``;
    const options = orgs.map(o =>
        html`<option value="${o.id}">${o.name}</option>`);
    return html`<select class="org-switcher"
        aria-label="Switch organization">${options}</select>`;
}

// Persist the chosen org and re-scope via a FULL reload: boot
// re-exchanges a scoped token from the persisted id, so no
// mixed-org view can survive the switch. Reload only on a
// confirmed persist — a false return means the id never
// landed, so a reload would silently keep the prior org.
function switchToOrg(org: string): void {
    if (!writePreference(ACTIVE_ORG_KEY, org)) {
        showToast(
            'Could not switch organization —'
            + ' please try again.',
            'error',
        );
        return;
    }
    location.reload();
}

// Select the active org and wire the change handler. The
// `<select>` lives inside the clickable greeting, so its
// pointer/keyboard events stopPropagation — selecting an org
// must not also open the member profile.
export function wireOrgSwitcher(activeOrgId: string): void {
    const select =
        document.querySelector<HTMLSelectElement>(
            '.org-switcher');
    if (select === null) return;
    select.value = activeOrgId;
    for (const type of ['click', 'mousedown', 'keydown']) {
        select.addEventListener(
            type, e => e.stopPropagation());
    }
    select.addEventListener('change', () => {
        switchToOrg(select.value);
    });
}
