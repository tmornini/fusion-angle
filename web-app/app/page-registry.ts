import type { IconFn } from './icons.ts';
import {
    iconHome,
    iconMail,
    iconLightbulb,
    iconFolderKanban,
    iconGitBranch,
    iconUsers,
    iconSettings,
    iconUser,
    iconCreditCard,
    iconActivity,
    iconDatabase,
    iconPalette,
} from './icons.ts';

export interface PageEntry {
    title: string;
    layout: 'sidebar' | 'standalone';
    sourceDir: string;
    sourceFile: string;
    icon?: IconFn;
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
        icon: iconHome,
        keywords: 'home overview',
    },
    workbox: {
        title: 'Workbox',
        layout: 'sidebar',
        sourceDir: 'workbox',
        sourceFile: 'index',
        icon: iconMail,
        keywords:
            'workbox inbox work order',
    },
    'workbox-detail': {
        title: 'Work Order',
        layout: 'sidebar',
        sourceDir: 'workbox',
        sourceFile: 'detail',
        icon: iconMail,
        searchable: false,
    },
    ideas: {
        title: 'Ideas',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'index',
        icon: iconLightbulb,
        keywords: 'ideas list innovation',
    },
    'idea-detail': {
        title: 'Idea Detail',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'detail',
        icon: iconLightbulb,
        searchable: false,
    },
    projects: {
        title: 'Projects',
        layout: 'sidebar',
        sourceDir: 'projects',
        sourceFile: 'index',
        icon: iconFolderKanban,
        keywords:
            'projects list kanban',
    },
    'project-detail': {
        title: 'Project Detail',
        layout: 'sidebar',
        sourceDir: 'projects',
        sourceFile: 'detail',
        icon: iconFolderKanban,
        searchable: false,
    },
    flows: {
        title: 'Flows',
        layout: 'sidebar',
        sourceDir: 'flows',
        sourceFile: 'index',
        icon: iconGitBranch,
        keywords:
            'flow, process,'
            + ' state machine',
    },
    'flow-detail': {
        title: 'Flow Designer',
        layout: 'standalone',
        sourceDir: 'flows',
        sourceFile: 'detail',
        icon: iconGitBranch,
        searchable: false,
    },
    teams: {
        title: 'Teams',
        layout: 'sidebar',
        sourceDir: 'teams',
        sourceFile: 'index',
        icon: iconUsers,
        keywords: 'team members roster',
    },
    organization: {
        title: 'Organization',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'index',
        icon: iconSettings,
        keywords:
            'organization billing plan',
    },
    profile: {
        title: 'Profile',
        layout: 'sidebar',
        sourceDir: 'profile',
        sourceFile: 'index',
        icon: iconUser,
        keywords:
            'profile settings personal',
    },
    company: {
        title: 'Company',
        layout: 'sidebar',
        sourceDir: 'company',
        sourceFile: 'index',
        icon: iconSettings,
        keywords: 'company organization',
    },
    billing: {
        title: 'Billing',
        layout: 'sidebar',
        sourceDir: 'billing',
        sourceFile: 'index',
        icon: iconCreditCard,
        keywords:
            'billing plan invoices'
            + ' payment',
    },
    users: {
        title: 'Users',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'users',
        icon: iconUsers,
        keywords: 'users invite manage admin',
    },
    'activity-feed': {
        title: 'Activity Feed',
        layout: 'sidebar',
        sourceDir: 'organization',
        sourceFile: 'activity-feed',
        icon: iconActivity,
        keywords: 'activity feed log',
    },
    snapshots: {
        title: 'Snapshots',
        layout: 'sidebar',
        sourceDir: 'snapshots',
        sourceFile: 'index',
        icon: iconDatabase,
        keywords:
            'data export import wipe',
    },
    'design-system': {
        title: 'Design System',
        layout: 'sidebar',
        sourceDir: 'design-system',
        sourceFile: 'index',
        icon: iconPalette,
        keywords:
            'components ui reference',
    },
    'idea-create': {
        title: 'Create Idea',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'create',
        icon: iconLightbulb,
        keywords: 'new idea submit',
    },
    'idea-convert': {
        title: 'Convert Idea',
        layout: 'sidebar',
        sourceDir: 'ideas',
        sourceFile: 'convert',
        icon: iconLightbulb,
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
