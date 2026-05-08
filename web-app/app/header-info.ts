import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

interface HeaderData {
    personId: string;
    personName: string;
    organization: string;
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
        getCurrentPersonRow,
        getOrganization,
        getDashboardStats,
        Person,
    } = await import('./adapters');
    const { getTimeOfDay } =
        await import('./format');
    const ctx = createFetchContext();
    const [personRow, org, stats] =
        await Promise.all([
            getCurrentPersonRow(ctx),
            getOrganization(ctx),
            getDashboardStats(ctx),
        ]);
    return {
        personId: personRow.id,
        personName:
            new Person(personRow).fullName(),
        organization: org.nameText(),
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
headerInfo.personName}`,
        );
        greetingEl.addEventListener(
            'click',
            () => navigateTo(
                'people-detail',
                { personId: headerInfo.personId },
            ),
        );
    }
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
