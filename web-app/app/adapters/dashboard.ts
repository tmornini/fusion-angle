import { GET } from '../../../api/api';
import type { IdeaEntity, ProjectEntity, ProcessEntity } from '../../../api/types';
import { durationInDays, formatCompactCurrency } from '../format';

export interface GaugeCard {
  title: string;
  icon: string;
  iconCssClass: string;
  theme: 'blue' | 'green' | 'amber';
  outer: { value: number; max: number; label: string; display: string };
  inner: { value: number; max: number; label: string; display: string };
  hasOverrunWarning: boolean;
}

export async function getDashboardGauges(prefetchedProjects?: ProjectEntity[]): Promise<GaugeCard[]> {
  const allProjects = prefetchedProjects ?? await GET('projects') as ProjectEntity[];
  const projects = allProjects.filter(p => p.status === 'approved');

  const sumEstimatedDuration = projects.reduce((sum, p) => sum + p.estimated_duration, 0);
  const sumActualDuration = projects.reduce((sum, p) => sum + p.actual_duration, 0);
  const sumEstimatedCost = projects.reduce((sum, p) => sum + p.estimated_cost, 0);
  const sumActualCost = projects.reduce((sum, p) => sum + p.actual_cost, 0);
  const sumEstimatedImpact = projects.reduce((sum, p) => sum + p.estimated_impact, 0);
  const sumActualImpact = projects.reduce((sum, p) => sum + p.actual_impact, 0);

  const baselineDays = durationInDays(sumEstimatedDuration);
  const currentDays = durationInDays(sumActualDuration);
  const estCost = Math.ceil(sumEstimatedCost);
  const actCost = Math.ceil(sumActualCost);
  const maxImpact = Math.max(sumEstimatedImpact, sumActualImpact) || 1;

  return [
    {
      title: 'Time', icon: 'clock', iconCssClass: 'text-success', theme: 'green',
      outer: { value: baselineDays, max: baselineDays, label: 'Baseline', display: `${baselineDays}d` },
      inner: { value: currentDays, max: baselineDays, label: 'Current', display: `${currentDays}d` },
      hasOverrunWarning: true,
    },
    {
      title: 'Cost', icon: 'dollarSign', iconCssClass: 'text-primary', theme: 'blue',
      outer: { value: estCost, max: estCost, label: 'Baseline', display: formatCompactCurrency(estCost) },
      inner: { value: actCost, max: estCost, label: 'Current', display: formatCompactCurrency(actCost) },
      hasOverrunWarning: true,
    },
    {
      title: 'Impact', icon: 'zap', iconCssClass: 'text-warning', theme: 'amber',
      outer: { value: sumEstimatedImpact, max: maxImpact, label: 'Baseline', display: `${sumEstimatedImpact} pts` },
      inner: { value: sumActualImpact, max: maxImpact, label: 'Current', display: `${sumActualImpact} pts` },
      hasOverrunWarning: false,
    },
  ];
}

export async function getDashboardStats(): Promise<{ label: string; value: number; trend: string }[]> {
  const [ideas, projects, processes] = await Promise.all([
    GET('ideas') as Promise<IdeaEntity[]>,
    GET('projects') as Promise<ProjectEntity[]>,
    GET('processes') as Promise<ProcessEntity[]>,
  ]);

  return [
    { label: 'Ideas', value: ideas.filter(i => i.status !== 'deleted').length, trend: '' },
    { label: 'Projects', value: projects.filter(p => p.status !== 'deleted').length, trend: '' },
    { label: 'Flow', value: processes.length, trend: '' },
  ];
}
