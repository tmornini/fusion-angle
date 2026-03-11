export interface PageEntry {
  title: string;
  layout: 'sidebar' | 'standalone';
}

export const PAGE_REGISTRY: Record<string, PageEntry> = {
  dashboard:                  { title: 'Dashboard',                layout: 'sidebar' },
  ideas:                      { title: 'Ideas',                    layout: 'sidebar' },
  projects:                   { title: 'Projects',                 layout: 'sidebar' },
  'project-detail':           { title: 'Project Detail',           layout: 'sidebar' },
  'engineering-requirements':  { title: 'Engineering Requirements',  layout: 'sidebar' },
  'idea-review-queue':        { title: 'Review Queue',             layout: 'sidebar' },
  edge:                       { title: 'Edge Definition',          layout: 'sidebar' },
  'edge-list':                { title: 'Edge List',                layout: 'sidebar' },
  crunch:                     { title: 'Crunch',                   layout: 'sidebar' },
  flow:                       { title: 'Flow',                     layout: 'sidebar' },
  team:                       { title: 'Teams',                    layout: 'sidebar' },
  account:                    { title: 'Account',                  layout: 'sidebar' },
  profile:                    { title: 'Profile',                  layout: 'sidebar' },
  'company-settings':         { title: 'Company Settings',         layout: 'sidebar' },
  'manage-users':             { title: 'Manage Users',             layout: 'sidebar' },
  'activity-feed':            { title: 'Activity Feed',            layout: 'sidebar' },
  snapshots:                  { title: 'Snapshots',                layout: 'sidebar' },
  'design-system':            { title: 'Design System',            layout: 'sidebar' },
  'idea-create':              { title: 'Create Idea',              layout: 'standalone' },
  'idea-convert':             { title: 'Convert Idea',             layout: 'standalone' },
  'approval-detail':          { title: 'Approval Detail',          layout: 'standalone' },
  auth:                       { title: 'Authentication',           layout: 'standalone' },
  landing:                    { title: 'Landing',                  layout: 'standalone' },
  onboarding:                 { title: 'Onboarding',               layout: 'standalone' },
  'not-found':                { title: '404 Not Found',            layout: 'standalone' },
};
