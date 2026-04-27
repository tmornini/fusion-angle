import type { SafeHtml } from './safe-html.ts';
import {
    iconHome,
    iconLightbulb,
    iconFolderKanban,
    iconGitBranch,
    iconMail,
    iconUser,
    iconBuilding,
    iconUsers,
    iconSettings,
    iconCreditCard,
    iconDatabase,
    iconPalette,
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
        href: '../profile/index.html',
        pageLink: 'profile',
        label: 'Profile',
        icon: iconUser,
    },
    {
        href: '../organization/index.html',
        pageLink: 'organization',
        label: 'Organization',
        icon: iconBuilding,
    },
    {
        href: '../teams/index.html',
        pageLink: 'teams',
        label: 'Teams',
        icon: iconUsers,
    },
    {
        href: '../company/index.html',
        pageLink: 'company',
        label: 'Company',
        icon: iconSettings,
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
