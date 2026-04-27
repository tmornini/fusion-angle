import { $ } from './dom';
import { navigateTo } from './navigation';

interface HeaderData {
    userName: string;
    company: string;
    greeting: string;
    stats: ReadonlyArray<{
        value: string | number;
        label: string;
    }>;
}

async function getHeaderData(
): Promise<HeaderData> {
    const {
        getCurrentUser,
        getDashboardStats,
    } = await import('./adapters');
    const { getTimeOfDay } =
        await import('./format');
    const [auth, stats] =
        await Promise.all([
            getCurrentUser(),
            getDashboardStats(),
        ]);
    return {
        userName: auth.user.fullName(),
        company: auth.company,
        greeting: getTimeOfDay(),
        stats,
    };
}

export async function mutateHeaderInfo(
): Promise<void> {
    const headerInfo = await getHeaderData();
    const { html, mutateHtml } =
        await import('./safe-html');
    const greetingEl =
        $('#header-greeting', document);
    if (greetingEl) {
        mutateHtml(
            greetingEl,
            html`<span
class="font-normal">Good ${
headerInfo.greeting},</span> ${
headerInfo.userName}`,
        );
        greetingEl.addEventListener(
            'click',
            () =>
                navigateTo('profile'),
        );
    }
    const statsEl =
        $('#header-stats', document);
    if (statsEl) {
        mutateHtml(
            statsEl,
            html`<span
class="header-stat-label">${
headerInfo.company}</span>${
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
