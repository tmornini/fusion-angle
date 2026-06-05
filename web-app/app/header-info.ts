import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

interface HeaderData {
    memberId: string;
    memberName: string;
    organization: string;
    orgs: ReadonlyArray<{ id: string; name: string }>;
    activeOrgId: string;
    greeting: string;
    stats: ReadonlyArray<{
        value: string | number;
        label: string;
    }>;
}

async function getHeaderData(
): Promise<HeaderData> {
    const {
        sessionContext,
        getHumanMember,
        getDashboardStats,
        ERASED_MEMBER_NAME,
    } = await import('./adapters');
    const { getOrganizations } =
        await import('./adapters/organizations.ts');
    const { DEFAULT_ORG } =
        await import('../../api/types.ts');
    const { getTimeOfDay } =
        await import('./format');
    const ctx = sessionContext();
    const [member, orgs, stats] =
        await Promise.all([
            getHumanMember(ctx, 'current'),
            getOrganizations(ctx),
            getDashboardStats(ctx),
        ]);
    const pii = member.pii();
    const activeOrgId =
        ctx.identity.organization ?? DEFAULT_ORG;
    const active =
        orgs.find(o => o.id === activeOrgId);
    return {
        memberId: member.idForLink(),
        memberName: pii.erased
            ? ERASED_MEMBER_NAME
            : pii.name,
        organization: active ? active.name : '',
        orgs: orgs.map(
            o => ({ id: o.id, name: o.name })),
        activeOrgId,
        greeting: getTimeOfDay(),
        stats,
    };
}

export async function mutateHeaderInfo(
): Promise<void> {
    const headerInfo = await getHeaderData();
    const { html, setHtml } =
        await import('./safe-html');
    const { orgSwitcherHtml, wireOrgSwitcher } =
        await import('./org-switcher.ts');
    const greetingEl =
        $('#header-greeting', document);
    if (greetingEl) {
        setHtml(
            greetingEl,
            html`<span
class="font-normal">Good ${
headerInfo.greeting},</span> ${
headerInfo.memberName}${
orgSwitcherHtml(headerInfo.orgs)}`,
        );
        greetingEl.setAttribute('role', 'button');
        greetingEl.setAttribute('tabindex', '0');
        greetingEl.setAttribute(
            'aria-label',
            'Open your member profile',
        );
        greetingEl.classList.add('cursor-pointer');
        const goToProfile = (): void => {
            navigateTo(
                'member-detail',
                { memberId: headerInfo.memberId },
            );
        };
        greetingEl.addEventListener(
            'click', goToProfile,
        );
        greetingEl.addEventListener(
            'keydown', (e) => {
                if (
                    e.key === 'Enter'
                    || e.key === ' '
                ) {
                    e.preventDefault();
                    goToProfile();
                }
            },
        );
        wireOrgSwitcher(headerInfo.activeOrgId);
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
