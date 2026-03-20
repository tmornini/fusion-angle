import type { IconName } from './icons';

export interface PageEntry {
    title: string;
    layout: 'sidebar' | 'standalone';
    sourceDir?: string;
    // basename without extension;
    // defaults to 'index'
    sourceFile?: string;
    // icon function name from icons.ts
    // (used by command palette)
    icon?: IconName;
    // extra search terms for Cmd+K
    keywords?: string;
    // false to hide from command palette
    // (default: true)
    searchable?: boolean;
}

export const PAGE_REGISTRY: Record<
    string,
    PageEntry
> = {
    dashboard: {
        title: 'Dashboard',
        layout: 'sidebar',
        icon: 'home',
        keywords: 'home overview',
    },
    ideas: {
        title: 'Ideas',
        layout: 'sidebar',
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
    'engineering-requirements': {
        title: 'Engineering Requirements',
        layout: 'sidebar',
        sourceDir: 'projects',
        sourceFile:
            'engineering-requirements',
        icon: 'fileText',
        searchable: false,
    },
    'idea-review-queue': {
        title: 'Review Queue',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'review-queue',
        icon: 'clipboardCheck',
        keywords: 'review approve reject',
    },
    edges: {
        title: 'Edges',
        layout: 'sidebar',
        icon: 'target',
        keywords:
            'edge outcomes metrics',
    },
    'edge-detail': {
        title: 'Edge Detail',
        layout: 'sidebar',
        sourceDir: 'edges',
        sourceFile: 'detail',
        icon: 'target',
        searchable: false,
    },
    crunch: {
        title: 'Crunch',
        layout: 'sidebar',
        icon: 'database',
        keywords:
            'data labeling columns',
    },
    flow: {
        title: 'Flow',
        layout: 'sidebar',
        icon: 'gitBranch',
        keywords:
            'process workflow steps',
    },
    'flow-detail': {
        title: 'Flow Detail',
        layout: 'sidebar',
        sourceDir: 'flow',
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
        icon: 'settings',
        keywords:
            'account organization'
            + ' billing plan',
    },
    profile: {
        title: 'Profile',
        layout: 'sidebar',
        icon: 'user',
        keywords:
            'profile settings personal',
    },
    settings: {
        title: 'Company Settings',
        layout: 'sidebar',
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
        icon: 'database',
        keywords:
            'data export import wipe',
    },
    'design-system': {
        title: 'Design System',
        layout: 'sidebar',
        icon: 'palette',
        keywords:
            'components ui reference',
    },
    'idea-create': {
        title: 'Create Idea',
        layout: 'standalone',
        sourceDir: 'ideas',
        sourceFile: 'create',
        icon: 'lightbulb',
        keywords: 'new idea submit',
    },
    'idea-convert': {
        title: 'Convert Idea',
        layout: 'standalone',
        sourceDir: 'ideas',
        sourceFile: 'convert',
        icon: 'lightbulb',
        searchable: false,
    },
    'approval-detail': {
        title: 'Approval Detail',
        layout: 'standalone',
        sourceDir: 'ideas',
        sourceFile: 'approval-detail',
        icon: 'clipboardCheck',
        searchable: false,
    },
    auth: {
        title: 'Authentication',
        layout: 'standalone',
        searchable: false,
    },
    landing: {
        title: 'Landing',
        layout: 'standalone',
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
        searchable: false,
    },
};
