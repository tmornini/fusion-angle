import type { SafeHtml } from './safe-html.ts';
import {
    iconHome,
    iconLightbulb,
    iconFolderKanban,
    iconGitBranch,
    iconMail,
    iconBuilding,
    iconPeople,
    iconSettings,
    iconCreditCard,
    iconDatabase,
    iconPalette,
    iconShield,
    iconBriefcase,
} from './icons.ts';

interface SidebarNavItem {
    href: string;
    pageLink: string;
    label: string;
    icon: (size: number, cssClass: string) => SafeHtml;
}

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
    {
        href: '../dashboard/index.html',
        pageLink: 'dashboard',
        label: 'Dashboard',
        icon: iconHome,
    },
    {
        href: '../ideas/index.html',
        pageLink: 'ideas',
        label: 'Ideas',
        icon: iconLightbulb,
    },
    {
        href: '../projects/index.html',
        pageLink: 'projects',
        label: 'Projects',
        icon: iconFolderKanban,
    },
    {
        href: '../flows/index.html',
        pageLink: 'flows',
        label: 'Flows',
        icon: iconGitBranch,
    },
    {
        href: '../workbox/index.html',
        pageLink: 'workbox',
        label: 'Workbox',
        icon: iconMail,
    },
    {
        href: '../organization/index.html',
        pageLink: 'organization',
        label: 'Organization',
        icon: iconBuilding,
    },
    {
        href: '../people/index.html',
        pageLink: 'people',
        label: 'People',
        icon: iconPeople,
    },
    {
        href: '../roles/index.html',
        pageLink: 'roles',
        label: 'Roles',
        icon: iconShield,
    },
    {
        href: '../crews/index.html',
        pageLink: 'crews',
        label: 'Crews',
        icon: iconBriefcase,
    },
    {
        href: '../billing/index.html',
        pageLink: 'billing',
        label: 'Billing',
        icon: iconCreditCard,
    },
    {
        href: '../snapshots/index.html',
        pageLink: 'snapshots',
        label: 'Snapshots',
        icon: iconDatabase,
    },
    {
        href: '../design-system/index.html',
        pageLink: 'design-system',
        label: 'Design System',
        icon: iconPalette,
    },
];

export function buildSidebarNavItemsHtml(): string {
    return SIDEBAR_NAV_ITEMS
        .map(item =>
            `<a class="sidebar-nav-item"`
            + ` href="${item.href}"`
            + ` data-page-link="${item.pageLink}">`
            + `${item.icon(20, '')}`
            + ` <span class="sidebar-nav-text">`
            + `${item.label}</span></a>`
        )
        .join('\n');
}
