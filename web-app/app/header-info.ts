import { $ } from './dom.ts';
import {
    html, setHtml, type SafeHtml,
} from './safe-html.ts';
import { log } from './logger.ts';
import {
    shouldShowOrganizationSwitcher,
} from '../../client/organization-session.ts';
import {
    organizationSwitcherHtml,
    wireOrganizationSwitcher,
} from './organization-switcher.ts';
import type {
    OrganizationEntity,
} from '../../shared/types.ts';
import type { HttpMessage } from
    '../../shared/http-message/http-message.ts';

interface HeaderStat {
    readonly value: string | number;
    readonly label: string;
}

export function currentOrganizationControlHtml(
    organizations: readonly {
        readonly id: string;
        readonly name: string;
    }[],
): SafeHtml {
    if (shouldShowOrganizationSwitcher(
        organizations,
    )) {
        return organizationSwitcherHtml(organizations);
    }
    const only = organizations[0];
    if (only === undefined) return html``;
    return html`<span class="header-stat-label">${
        only.name
    }</span>`;
}

export function headerStatsHtml(
    control: SafeHtml,
    stats: readonly HeaderStat[],
): SafeHtml {
    const tiles = stats.map(stat => html`<div
class="header-stat-divider"></div>
<div class="header-stat-item">
<span class="header-stat-value">${
stat.value}</span>
<span class="header-stat-label">${
stat.label}</span></div>`);
    return html`${control}${tiles}`;
}

function organizationOptions(
    messages: readonly HttpMessage<
        OrganizationEntity
    >[],
): { id: string; name: string }[] {
    return messages.map(message => {
        const organization = message.body().toValue();
        return {
            id: organization.id,
            name: organization.name,
        };
    });
}

// A null boot list is the degraded edge: the header
// fetches. An array, including an empty one, is the
// boot's list and is not fetched again.
async function loadOrganizationOptions(
    bootOrganizations:
        readonly HttpMessage<OrganizationEntity>[]
        | null,
): Promise<readonly {
    id: string;
    name: string;
}[]> {
    if (bootOrganizations !== null) {
        return organizationOptions(bootOrganizations);
    }
    const { sessionContext } = await import(
        './client.ts'
    );
    const { getOrganizations } = await import(
        '../../client/organizations.ts'
    );
    return organizationOptions(
        await getOrganizations(sessionContext()),
    );
}

async function loadHeaderStats(
): Promise<readonly HeaderStat[]> {
    const { sessionContext } = await import(
        './client.ts'
    );
    const { getDashboardStats } = await import(
        './dashboard.ts'
    );
    return getDashboardStats(sessionContext());
}

// null is a failed read. An empty list is a read
// that succeeded and named nothing.
export function headerHostsFromReads(
    organizations: readonly {
        readonly id: string;
        readonly name: string;
    }[] | null,
    stats: readonly HeaderStat[] | null,
): {
    readonly desktop: SafeHtml | null;
    readonly mobile: SafeHtml | null;
} {
    if (organizations === null && stats === null) {
        return { desktop: null, mobile: null };
    }
    const control = organizations === null
        ? html``
        : currentOrganizationControlHtml(
            organizations,
        );
    const desktop = stats === null
        ? control
        : headerStatsHtml(control, stats);
    if (organizations === null) {
        return { desktop, mobile: null };
    }
    return { desktop, mobile: control };
}

// Two or more organizations: the select replaces the
// name and the stat tiles follow it. One organization:
// the name stays text. None: the control is empty.
// The mobile header gets the same control and no
// tiles. Each read settles on its own, so one
// rejection cannot drop the other host. Both
// rejected leaves the hosts as they are. An
// unscoped session never calls this, so
// #header-stats stays empty and .header-info:empty
// keeps hiding it.
export async function mutateHeaderInfo(
    bootOrganizations:
        readonly HttpMessage<OrganizationEntity>[]
        | null = null,
): Promise<void> {
    const [organizationResult, statsResult] =
        await Promise.allSettled([
            loadOrganizationOptions(bootOrganizations),
            loadHeaderStats(),
        ]);
    if (organizationResult.status === 'rejected') {
        log.warn(
            'organization list failed to load',
            'header',
            organizationResult.reason,
        );
    }
    if (statsResult.status === 'rejected') {
        log.warn(
            'header stats failed to load',
            'header',
            statsResult.reason,
        );
    }
    const organizations =
        organizationResult.status === 'fulfilled'
            ? organizationResult.value
            : null;
    const stats = statsResult.status === 'fulfilled'
        ? statsResult.value
        : null;
    const { desktop, mobile } = headerHostsFromReads(
        organizations, stats,
    );
    const statsEl = $('#header-stats', document);
    if (statsEl && desktop !== null) {
        setHtml(statsEl, desktop);
    }
    const mobileEl = $(
        '#mobile-header-organization',
        document,
    );
    if (mobileEl && mobile !== null) {
        setHtml(mobileEl, mobile);
    }
    if (
        organizations !== null
        && shouldShowOrganizationSwitcher(
            organizations,
        )
    ) {
        const { sessionContext } = await import(
            './client.ts'
        );
        wireOrganizationSwitcher(
            sessionContext()
                .identity.organization ?? '',
        );
    }
}
