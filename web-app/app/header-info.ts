import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

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
        createFetchContext,
        getCurrentUserRow,
        getCompanyRow,
        getDashboardStats,
        User,
    } = await import('./adapters');
    const { getTimeOfDay } =
        await import('./format');
    const ctx = createFetchContext();
    const [userRow, company, stats] =
        await Promise.all([
            getCurrentUserRow(ctx),
            getCompanyRow(ctx),
            getDashboardStats(ctx),
        ]);
    return {
        userName: new User(userRow).fullName(),
        company: company.name,
        greeting: getTimeOfDay(),
        stats,
    };
}

export async function mutateHeaderInfo(
): Promise<void> {
    const headerInfo = await getHeaderData();
    const { html, setHtml } =
        await import('./safe-html');
    const greetingEl =
        $('#header-greeting', document);
    if (greetingEl) {
        setHtml(
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
        setHtml(
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
