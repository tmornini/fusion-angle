import { $ } from './dom.ts';

interface HeaderData {
    organization: string;
    stats: ReadonlyArray<{
        value: string | number;
        label: string;
    }>;
}

async function getHeaderData(
): Promise<HeaderData> {
    const {
        sessionContext,
        getOrganization,
        getDashboardStats,
    } = await import('./adapters/index.ts');
    const ctx = sessionContext();
    const [organization, stats] =
        await Promise.all([
            getOrganization(ctx),
            getDashboardStats(ctx),
        ]);
    return {
        organization: organization.nameText(),
        stats,
    };
}

// The top-bar context strip: the active org name followed by the
// dashboard stat tiles. The greeting and the org switcher that
// once lived here have moved — the switcher to the sidebar
// footer, the profile link to the sidebar member chip — leaving
// the top bar to the pending-invitations indicator (see
// invitations-indicator.ts) and this read-only strip.
export async function mutateHeaderInfo(
): Promise<void> {
    const headerInfo = await getHeaderData();
    const { html, setHtml } =
        await import('./safe-html.ts');
    const statsEl =
        $('#header-stats', document);
    if (statsEl) {
        setHtml(
            statsEl,
            html`<span
class="header-stat-label">${
headerInfo.organization}</span>${
headerInfo.stats.map(
    (stat) =>
        html`<div
class="header-stat-divider"></div>
<div class="header-stat-item">
<span class="header-stat-value">${
stat.value}</span>
<span class="header-stat-label">${
stat.label}</span></div>`,
)}`,
        );
    }
}
