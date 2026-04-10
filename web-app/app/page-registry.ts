import type { IconName } from './icons';

export interface PageEntry {
    title: string;
    layout: 'sidebar' | 'standalone';
    sourceDir: string;
    sourceFile: string;
    icon?: IconName;
    keywords?: string;
    searchable?: boolean;
}

export const PAGE_REGISTRY: Record<
    string,
    PageEntry
> = {
    dashboard: {
        title: 'Dashboard',
        layout: 'sidebar',
        sourceDir: 'dashboard',
        sourceFile: 'index',
        icon: 'home',
        keywords: 'home overview',
    },
    workbox: {
        title: 'Workbox',
        layout: 'sidebar',
        sourceDir: 'workbox',
        sourceFile: 'index',
        icon: 'mail',
        keywords:
            'workbox inbox work order',
    },
    'workbox-detail': {
        title: 'Work Order',
        layout: 'sidebar',
        sourceDir: 'workbox',
        sourceFile: 'detail',
        icon: 'mail',
        searchable: false,
    },
    ideas: {
        title: 'Ideas',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'index',
        icon: 'lightbulb',
        keywords: 'ideas list innovation',
    },
    'idea-detail': {
        title: 'Idea Detail',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'detail',
        icon: 'lightbulb',
        searchable: false,
    },
    projects: {
        title: 'Projects',
        layout: 'sidebar',
        sourceDir: 'projects',
        sourceFile: 'index',
        icon: 'folderKanban',
        keywords:
            'projects list kanban',
    },
    'project-detail': {
        title: 'Project Detail',
        layout: 'sidebar',
        sourceDir: 'projects',
        sourceFile: 'detail',
        icon: 'folderKanban',
        searchable: false,
    },
    flows: {
        title: 'Flows',
        layout: 'sidebar',
        sourceDir: 'flows',
        sourceFile: 'index',
        icon: 'gitBranch',
        keywords:
            'flow, process,'
            + ' state machine',
    },
    'flows-detail': {
        title: 'Flow Designer',
        layout: 'sidebar',
        sourceDir: 'flows',
        sourceFile: 'detail',
        icon: 'gitBranch',
        searchable: false,
    },
    teams: {
        title: 'Teams',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'teams',
        icon: 'users',
        keywords: 'team members roster',
    },
    account: {
        title: 'Organization',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'index',
        icon: 'settings',
        keywords:
            'account organization'
            + ' billing plan',
    },
    profile: {
        title: 'Profile',
        layout: 'sidebar',
        sourceDir: 'profile',
        sourceFile: 'index',
        icon: 'user',
        keywords:
            'profile settings personal',
    },
    settings: {
        title: 'Company Settings',
        layout: 'sidebar',
        sourceDir: 'settings',
        sourceFile: 'index',
        icon: 'settings',
        keywords:
            'company organization'
            + ' settings',
    },
    users: {
        title: 'Users',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'users',
        icon: 'users',
        keywords: 'users invite manage admin',
    },
    'activity-feed': {
        title: 'Activity Feed',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'activity-feed',
        icon: 'activity',
        keywords: 'activity feed log',
    },
    snapshots: {
        title: 'Snapshots',
        layout: 'sidebar',
        sourceDir: 'snapshots',
        sourceFile: 'index',
        icon: 'database',
        keywords:
            'data export import wipe',
    },
    'design-system': {
        title: 'Design System',
        layout: 'sidebar',
        sourceDir: 'design-system',
        sourceFile: 'index',
        icon: 'palette',
        keywords:
            'components ui reference',
    },
    'idea-create': {
        title: 'Create Idea',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'create',
        icon: 'lightbulb',
        keywords: 'new idea submit',
    },
    'idea-convert': {
        title: 'Convert Idea',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'convert',
        icon: 'lightbulb',
        searchable: false,
    },
    auth: {
        title: 'Authentication',
        layout: 'standalone',
        sourceDir: 'auth',
        sourceFile: 'index',
        searchable: false,
    },
    landing: {
        title: 'Landing',
        layout: 'standalone',
        sourceDir: 'landing',
        sourceFile: 'index',
        searchable: false,
    },
    onboarding: {
        title: 'Onboarding',
        layout: 'standalone',
        sourceDir: 'organization',
        sourceFile: 'onboarding',
        searchable: false,
    },
    'not-found': {
        title: '404 Not Found',
        layout: 'standalone',
        sourceDir: 'not-found',
        sourceFile: 'index',
        searchable: false,
    },
};
