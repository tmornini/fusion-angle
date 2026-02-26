import { GET } from '../../../api/api';
import type { IdeaEntity, ProjectEntity } from '../../../api/types';

export interface GaugeCard {
  title: string;
  icon: string;
  iconCssClass: string;
  theme: 'blue' | 'green' | 'amber';
  outer: { value: number; max: number; label: string; display: string };
  inner: { value: number; max: number; label: string; display: string };
}

export interface QuickAction {
  label: string;
  icon: string;
  href: string;
}

export async function getDashboardGauges(prefetchedProjects?: ProjectEntity[]): Promise<GaugeCard[]> {
  const projects = prefetchedProjects ?? await GET('projects') as ProjectEntity[];
  const totalEstimatedTime = projects.reduce((sum, project) => sum + project.estimated_time, 0);
  const totalActualTime = projects.reduce((sum, project) => sum + project.actual_time, 0);
  const totalEstimatedCost = projects.reduce((sum, project) => sum + project.estimated_cost, 0);
  const totalActualCost = projects.reduce((sum, project) => sum + project.actual_cost, 0);
  const averageEstimatedImpact = projects.length ? Math.round(projects.reduce((sum, project) => sum + project.estimated_impact, 0) / projects.length) : 0;
  const projectsWithActualImpact = projects.filter(project => project.actual_impact > 0);
  const averageActualImpact = projectsWithActualImpact.length ? Math.round(projectsWithActualImpact.reduce((sum, project) => sum + project.actual_impact, 0) / projectsWithActualImpact.length) : 0;

  return [
    {
      title: 'Time Tracking', icon: 'clock', iconCssClass: 'text-success', theme: 'green',
      outer: { value: Math.round(totalActualTime / 24), max: Math.round(totalEstimatedTime / 24), label: 'Total Duration', display: `${Math.round(totalEstimatedTime / 24)}d` },
      inner: { value: Math.round(totalActualTime / 48), max: Math.round(totalEstimatedTime / 24), label: 'Days Elapsed', display: `${Math.round(totalActualTime / 48)}d` },
    },
    {
      title: 'Cost Overview', icon: 'dollarSign', iconCssClass: 'text-primary', theme: 'blue',
      outer: { value: totalActualCost, max: totalEstimatedCost, label: 'Budget Spent', display: `$${(totalActualCost / 1000).toFixed(1)}K` },
      inner: { value: Math.round(totalActualCost * 0.6), max: totalEstimatedCost, label: 'ROI Generated', display: `$${(totalActualCost * 0.6 / 1000).toFixed(0)}K` },
    },
    {
      title: 'Project Impact', icon: 'zap', iconCssClass: 'text-warning', theme: 'amber',
      outer: { value: averageEstimatedImpact, max: 100, label: 'Target Score', display: `${averageEstimatedImpact}%` },
      inner: { value: averageActualImpact, max: 100, label: 'Current Score', display: `${averageActualImpact}%` },
    },
  ];
}

export async function getDashboardQuickActions(): Promise<QuickAction[]> {
  return [
    { label: 'New Idea', icon: 'lightbulb', href: '../../core/idea-create/index.html' },
    { label: 'Create Project', icon: 'folderKanban', href: '../../core/projects/index.html' },
    { label: 'Invite Team', icon: 'users', href: '../../admin/team/index.html' },
    { label: 'View Reports', icon: 'trendingUp', href: '../../core/dashboard/index.html' },
  ];
}

export async function getDashboardStats(prefetchedIdeas?: IdeaEntity[], prefetchedProjects?: ProjectEntity[]): Promise<{ label: string; value: number; trend: string }[]> {
  const [ideas, projects] = prefetchedIdeas && prefetchedProjects
    ? [prefetchedIdeas, prefetchedProjects]
    : await Promise.all([
        GET('ideas') as Promise<IdeaEntity[]>,
        GET('projects') as Promise<ProjectEntity[]>,
      ]);
  const doneCount = projects.filter(project => project.progress >= 90).length;
  const reviewCount = ideas.filter(idea => idea.status === 'pending_review').length;
  return [
    { label: 'Ideas', value: ideas.length, trend: `+${Math.min(3, ideas.length)}` },
    { label: 'Projects', value: projects.length, trend: `+${Math.min(1, projects.length)}` },
    { label: 'Done', value: doneCount, trend: '' },
    { label: 'Review', value: reviewCount, trend: '' },
  ];
}
