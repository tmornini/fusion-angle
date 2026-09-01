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

export interface PageEntry {
    title: string;
    layout: 'sidebar' | 'standalone';
    inSidebarNav?: boolean;
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
        title: 'Dashboard',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'dashboard',
        sourceFile: 'index',
        icon: iconHome,
        keywords: 'home overview',
        loader: () => import('../dashboard/index.ts'),
    },
    organization: {
        title: 'Organization',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'organization',
        sourceFile: 'index',
        icon: iconBuilding,
        keywords:
            'organization billing plan',
        cssBundles: ['pages-organization'],
        loader: () => import('../organization/index.ts'),
    },
    ideas: {
        title: 'Ideas',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'ideas',
        sourceFile: 'index',
        icon: iconLightbulb,
        keywords: 'ideas list innovation',
        cssBundles: ['pages-ideas'],
        loader: () => import('../ideas/index.ts'),
    },
    'idea-detail': {
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
        title: 'Projects',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'projects',
        sourceFile: 'index',
        icon: iconFolderKanban,
        keywords:
            'projects list kanban',
        cssBundles: ['pages-projects'],
        loader: () => import('../projects/index.ts'),
    },
    'project-detail': {
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
    records: {
        title: 'Records',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'records',
        sourceFile: 'index',
        icon: iconDatabase,
        keywords:
            'records data shape attribute',
        cssBundles: ['pages-records'],
        loader: () => import('../records/index.ts'),
    },
    'record-create': {
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
    flows: {
        title: 'Flows',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'flows',
        sourceFile: 'index',
        icon: iconGitBranch,
        keywords:
            'flow, process,'
            + ' state machine',
        loader: () => import('../flows/index.ts'),
    },
    'flow-detail': {
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
    workbox: {
        title: 'Workbox',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'workbox',
        sourceFile: 'index',
        icon: iconMail,
        keywords:
            'workbox inbox work order',
        cssBundles: ['pages-workbox'],
        loader: () => import('../workbox/index.ts'),
    },
    'workbox-detail': {
        title: 'Work Order',
        layout: 'sidebar',
        sidebarKey: 'workbox',
        sourceDir: 'workbox',
        sourceFile: 'detail',
        icon: iconMail,
        searchable: false,
        cssBundles: ['pages-workbox'],
        loader: () => import('../workbox/detail.ts'),
    },
    members: {
        title: 'Members',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'members',
        sourceFile: 'index',
        icon: iconPeople,
        keywords:
            'members humans AI manage admin',
        cssBundles: ['pages-members'],
        loader: () => import('../members/index.ts'),
    },
    'member-detail': {
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
        title: 'Identities',
        layout: 'sidebar',
        inSidebarNav: true,
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
        title: 'Billing',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'billing',
        sourceFile: 'index',
        icon: iconCreditCard,
        keywords:
            'billing plan invoices'
            + ' payment',
        loader: () => import('../billing/index.ts'),
    },
    'api-documentation': {
        title: 'API',
        layout: 'sidebar',
        inSidebarNav: true,
        sourceDir: 'api-documentation',
        sourceFile: 'index',
        icon: iconBook,
        keywords: 'api http routes documentation',
        requiresAuth: false,
        cssBundles: ['pages-api-documentation'],
        loader: () => import('../api-documentation/index.ts'),
    },
    'design-system': {
        title: 'Design System',
        layout: 'sidebar',
        inSidebarNav: true,
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
