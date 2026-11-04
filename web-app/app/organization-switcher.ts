import { html, type SafeHtml } from './safe-html.ts';
import { $$ } from './dom.ts';
import {
    shouldShowOrganizationSwitcher,
    ACTIVE_ORGANIZATION_ID,
} from '../../client/organization-session.ts';
import { putPreference } from './adapters/preferences.ts';
import { showToast } from './toast.ts';

interface OrganizationOption {
    readonly id: string;
    readonly name: string;
}

// The current-organization select. Empty unless there
// are two or more reachable organizations. The active
// organization is selected after render in
// wireOrganizationSwitcher, so options carry no
// selected attribute. This menu switches and reloads.
// It does not set the default organization.
export function organizationSwitcherHtml(
    organizations: readonly OrganizationOption[],
): SafeHtml {
    if (!shouldShowOrganizationSwitcher(
        organizations,
    )) {
        return html``;
    }
    const options = organizations.map(
        organization => html`<option value="${
            organization.id
        }">${organization.name}</option>`,
    );
    return html`<select
        class="org-switcher"
        aria-label="Switch organization">${
        options
    }</select>`;
}

export function urlAfterOrganizationSwitch(
    href: string,
): string {
    const url = new URL(href, 'http://local');
    if (url.pathname.endsWith(
        '/ideas/convert.html',
    )) {
        url.pathname = url.pathname.replace(
            /convert\.html$/,
            'index.html',
        );
        url.search = '';
        url.hash = '';
    }
    return url.pathname + url.search + url.hash;
}

// Persist the chosen organization and re-scope.
// Boot re-exchanges a scoped token from the
// persisted id, so no mixed view survives. A
// convert URL leaves for the ideas index; every
// other URL reloads. Move only after a confirmed
// persist — a false return means the id never
// landed, so leaving would keep the prior one.
function switchToOrganization(organization: string): void {
    if (!putPreference(ACTIVE_ORGANIZATION_ID, organization)) {
        showToast(
            'Could not switch organization —'
            + ' please try again.',
            'error',
        );
        return;
    }
    const next = urlAfterOrganizationSwitch(
        location.href,
    );
    const here = location.pathname
        + location.search
        + location.hash;
    if (next !== here) {
        location.assign(next);
        return;
    }
    location.reload();
}

// Select the active organization and wire every
// .org-switcher. A change reloads through
// switchToOrganization.
export function wireOrganizationSwitcher(
    activeOrganizationId: string,
): void {
    for (const el of $$('.org-switcher', document)) {
        if (!(el instanceof HTMLSelectElement)) {
            continue;
        }
        el.value = activeOrganizationId;
        el.addEventListener('change', () => {
            switchToOrganization(el.value);
        });
    }
}
