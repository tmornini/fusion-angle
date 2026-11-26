import type { IconFn } from './icons.ts';
import {
    iconHome,
    iconMail,
    iconLightbulb,
    iconFolderKanban,
    iconBarChart,
    iconGitBranch,
    iconPeople,
    iconBuilding,
    iconPerson,
    iconShield,
    iconCreditCard,
    iconDatabase,
    iconPalette,
    iconBook,
} from './icons.ts';

// The sidebar's headings, in the order they render.
export const NAV_GROUPS = [
    'Strategy', 'Pipeline', 'Operations',
    'Account', 'Developer',
] as const;
export type NavGroup = typeof NAV_GROUPS[number];

export interface PageEntry {
    title: string;
    layout: 'sidebar' | 'standalone';
    inSidebarNav?: boolean;
    // The heading a sidebar link sits under.
    navGroup?: NavGroup;
    sidebarKey?: string;
    sourceDir: string;
    sourceFile: string;
    icon?: IconFn;
    keywords?: string;
    searchable?: boolean;
    // Auth-gated by default: a page is exempt only when this is
    // explicitly false. The boot gate reads
    // `requiresAuth !== false`, so the 23 app pages that
    // omit it inherit true; only the public surface opts out.
    requiresAuth?: boolean;
    // True when the server fences the page's reads on the token's
    // organization, or the page belongs to an organization though
    // it reads nothing (billing); boot stamps and checks
    // `organization=` only on these pages.
    organizationScoped: boolean;
    cssBundles?: string[];
    loader: () => Promise<{
        init: (
            params?: Record<string, string>,
        ) => void | Promise<void>;
    }>;
}

export const PAGE_REGISTRY: Record<
    string,
    PageEntry
> = {
    dashboard: {
        organizationScoped: true,
        title: 'Dashboard',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Strategy',
        sourceDir: 'dashboard',
        sourceFile: 'index',
        icon: iconHome,
        keywords: 'home overview',
        cssBundles: ['pages-dashboard'],
        loader: () => import('../dashboard/index.ts'),
    },
    organization: {
        organizationScoped: true,
        title: 'Organization',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Strategy',
        sourceDir: 'organization',
        sourceFile: 'index',
        icon: iconBuilding,
        keywords:
            'organization billing plan',
        cssBundles: ['pages-organization'],
        loader: () => import('../organization/index.ts'),
    },
    ideas: {
        organizationScoped: true,
        title: 'Ideas',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Pipeline',
        sourceDir: 'ideas',
        sourceFile: 'index',
        icon: iconLightbulb,
        keywords: 'ideas list innovation',
        cssBundles: ['pages-ideas'],
        loader: () => import('../ideas/index.ts'),
    },
    'idea-detail': {
        organizationScoped: true,
        title: 'Idea Detail',
        layout: 'sidebar',
        sidebarKey: 'ideas',
        sourceDir: 'ideas',
        sourceFile: 'detail',
        icon: iconLightbulb,
        searchable: false,
        cssBundles: ['pages-ideas'],
        loader: () => import('../ideas/detail.ts'),
    },
    'idea-create': {
        organizationScoped: true,
        title: 'Create Idea',
        layout: 'sidebar',
        sidebarKey: 'ideas',
        sourceDir: 'ideas',
        sourceFile: 'create',
        icon: iconLightbulb,
        keywords: 'new idea submit',
        cssBundles: ['pages-ideas'],
        loader: () => import('../ideas/create.ts'),
    },
    'idea-convert': {
        organizationScoped: true,
        title: 'Convert Idea',
        layout: 'sidebar',
        sidebarKey: 'ideas',
        sourceDir: 'ideas',
        sourceFile: 'convert',
        icon: iconLightbulb,
        searchable: false,
        cssBundles: ['pages-ideas'],
        loader: () => import('../ideas/convert.ts'),
    },
    projects: {
        organizationScoped: true,
        title: 'Projects',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Pipeline',
        sourceDir: 'projects',
        sourceFile: 'index',
        icon: iconFolderKanban,
        keywords:
            'projects list kanban',
        cssBundles: ['pages-projects'],
        loader: () => import('../projects/index.ts'),
    },
    'project-detail': {
        organizationScoped: true,
        title: 'Project Detail',
        layout: 'sidebar',
        sidebarKey: 'projects',
        sourceDir: 'projects',
        sourceFile: 'detail',
        icon: iconFolderKanban,
        searchable: false,
        cssBundles: ['pages-projects'],
        loader: () => import('../projects/detail.ts'),
    },
    flows: {
        organizationScoped: true,
        title: 'Flows',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Operations',
        sourceDir: 'flows',
        sourceFile: 'index',
        icon: iconGitBranch,
        keywords:
            'flow, process,'
            + ' state machine',
        loader: () => import('../flows/index.ts'),
    },
    'flow-detail': {
        organizationScoped: true,
        title: 'Flow Designer',
        layout: 'sidebar',
        sidebarKey: 'flows',
        sourceDir: 'flows',
        sourceFile: 'detail',
        icon: iconGitBranch,
        searchable: false,
        cssBundles: ['pages-flow-detail'],
        loader: () => import('../flows/detail.ts'),
    },
    'flow-stats': {
        organizationScoped: true,
        title: 'Flow Statistics',
        layout: 'sidebar',
        sidebarKey: 'flows',
        sourceDir: 'flows',
        sourceFile: 'stats',
        icon: iconBarChart,
        searchable: false,
        cssBundles: ['pages-flow-stats'],
        loader: () => import('../flows/stats.ts'),
    },
    records: {
        organizationScoped: true,
        title: 'Records',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Operations',
        sourceDir: 'records',
        sourceFile: 'index',
        icon: iconDatabase,
        keywords:
            'records data shape attribute',
        cssBundles: ['pages-records'],
        loader: () => import('../records/index.ts'),
    },
    'record-create': {
        organizationScoped: true,
        title: 'Create Record',
        layout: 'sidebar',
        sidebarKey: 'records',
        sourceDir: 'records',
        sourceFile: 'create',
        icon: iconDatabase,
        keywords: 'new record create',
        cssBundles: ['pages-records'],
        loader: () => import('../records/create.ts'),
    },
    'record-detail': {
        organizationScoped: true,
        title: 'Record',
        layout: 'sidebar',
        sidebarKey: 'records',
        sourceDir: 'records',
        sourceFile: 'detail',
        icon: iconDatabase,
        searchable: false,
        cssBundles: ['pages-records'],
        loader: () => import('../records/detail.ts'),
    },
    workbox: {
        organizationScoped: true,
        title: 'Workbox',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Operations',
        sourceDir: 'workbox',
        sourceFile: 'index',
        icon: iconMail,
        keywords:
            'workbox inbox work order',
        cssBundles: ['pages-workbox'],
        loader: () => import('../workbox/index.ts'),
    },
    members: {
        organizationScoped: true,
        title: 'Members',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Account',
        sourceDir: 'members',
        sourceFile: 'index',
        icon: iconPeople,
        keywords:
            'members humans AI services manage admin',
        cssBundles: ['pages-members'],
        loader: () => import('../members/index.ts'),
    },
    'member-detail': {
        organizationScoped: true,
        title: 'Member',
        layout: 'sidebar',
        sidebarKey: 'members',
        sourceDir: 'members',
        sourceFile: 'detail',
        icon: iconPerson,
        searchable: false,
        cssBundles: ['pages-members'],
        loader: () => import('../members/detail.ts'),
    },
    invitations: {
        organizationScoped: false,
        title: 'Invitations',
        layout: 'sidebar',
        sidebarKey: 'members',
        sourceDir: 'invitations',
        sourceFile: 'index',
        icon: iconMail,
        searchable: false,
        loader: () => import('../invitations/index.ts'),
    },
    identities: {
        organizationScoped: true,
        title: 'Identities',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Account',
        sourceDir: 'identities',
        sourceFile: 'index',
        icon: iconShield,
        keywords:
            'identities person service'
            + ' credentials providers tokens',
        cssBundles: ['pages-identities'],
        loader: () => import('../identities/index.ts'),
    },
    'identity-detail': {
        organizationScoped: true,
        title: 'Identity',
        layout: 'sidebar',
        sidebarKey: 'identities',
        sourceDir: 'identities',
        sourceFile: 'detail',
        icon: iconShield,
        searchable: false,
        cssBundles: ['pages-identities'],
        loader: () => import('../identities/detail.ts'),
    },
    'identity-providers': {
        organizationScoped: false,
        title: 'Identity Providers',
        layout: 'sidebar',
        sidebarKey: 'identities',
        sourceDir: 'identity-providers',
        sourceFile: 'index',
        icon: iconShield,
        searchable: false,
        cssBundles: ['pages-identities'],
        loader: () =>
            import('../identity-providers/index.ts'),
    },
    'identity-tokens': {
        organizationScoped: false,
        title: 'Tokens',
        layout: 'sidebar',
        sidebarKey: 'identities',
        sourceDir: 'identity-tokens',
        sourceFile: 'index',
        icon: iconShield,
        searchable: false,
        cssBundles: ['pages-identities'],
        loader: () =>
            import('../identity-tokens/index.ts'),
    },
    billing: {
        organizationScoped: true,
        title: 'Billing',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Account',
        sourceDir: 'billing',
        sourceFile: 'index',
        icon: iconCreditCard,
        keywords:
            'billing plan invoices'
            + ' payment',
        loader: () => import('../billing/index.ts'),
    },
    'api-documentation': {
        organizationScoped: false,
        title: 'API',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Developer',
        sourceDir: 'api-documentation',
        sourceFile: 'index',
        icon: iconBook,
        keywords: 'api http routes documentation',
        requiresAuth: false,
        cssBundles: ['pages-api-documentation'],
        loader: () => import('../api-documentation/index.ts'),
    },
    'design-system': {
        organizationScoped: false,
        title: 'Design System',
        layout: 'sidebar',
        inSidebarNav: true,
        navGroup: 'Developer',
        sourceDir: 'design-system',
        sourceFile: 'index',
        icon: iconPalette,
        keywords:
            'components ui reference',
        requiresAuth: false,
        cssBundles: ['pages-design-system'],
        loader: () => import('../design-system/index.ts'),
    },
    auth: {
        organizationScoped: false,
        title: 'Authentication',
        layout: 'standalone',
        sourceDir: 'auth',
        sourceFile: 'index',
        searchable: false,
        requiresAuth: false,
        cssBundles: ['pages-auth'],
        loader: () => import('../auth/index.ts'),
    },
    landing: {
        organizationScoped: false,
        title: 'Landing',
        layout: 'standalone',
        sourceDir: 'landing',
        sourceFile: 'index',
        searchable: false,
        requiresAuth: false,
        cssBundles: ['pages-landing'],
        loader: () => import('../landing/index.ts'),
    },
    'not-found': {
        organizationScoped: false,
        title: '404 Not Found',
        layout: 'standalone',
        sourceDir: 'not-found',
        sourceFile: 'index',
        searchable: false,
        requiresAuth: false,
        loader: () => import('../not-found/index.ts'),
    },
};

export type PageAuthMode =
    | 'missing'
    | 'gated'
    | 'public';

export function pageAuthMode(
    pageName: string,
): PageAuthMode {
    const entry = PAGE_REGISTRY[pageName];
    if (entry === undefined) return 'missing';
    if (entry.requiresAuth === false) return 'public';
    return 'gated';
}
