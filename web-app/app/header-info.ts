import { $ } from './dom';
import { navigateTo } from './navigation';
import { showToast } from './toast';

interface HeaderData {
    userName: string;
    company: string;
    greeting: string;
    stats: ReadonlyArray<{
        value: string | number;
        label: string;
    }>;
}

async function fetchHeaderData(
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
    let data: HeaderData;
    try {
        data = await fetchHeaderData();
    } catch {
        showToast(
            'Header info load failed',
            'error',
        );
        return;
    }
    const { html, setHtml } =
        await import('./safe-html');
    const greetingEl =
        $('#header-greeting', document);
    if (greetingEl) {
        setHtml(
            greetingEl,
            html`<span
style="font-weight:400">Good ${
data.greeting},</span> ${
data.userName}`,
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
data.company}</span>${
data.stats.map(
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
