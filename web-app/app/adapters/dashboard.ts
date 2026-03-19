import { GET } from '../../../api/api';
import type {
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
} from '../../../api/types';
import {
    durationInDays,
    formatCompactCurrency,
} from '../format';
import { isNotDeleted } from './helpers';

export interface GaugeCard {
    title: string;
    icon: string;
    iconCssClass: string;
    theme: 'blue' | 'green' | 'amber';
    outer: {
        value: number;
        max: number;
        label: string;
        display: string;
    };
    inner: {
        value: number;
        max: number;
        label: string;
        display: string;
    };
    hasOverrunWarning: boolean;
}

export async function getDashboardGauges(
): Promise<GaugeCard[]> {
    const allProjects =
        await GET<ProjectEntity[]>(
            'projects',
        );
    const projects = allProjects.filter(
        p => p.status === 'approved',
    );

    const sumEstimatedDuration =
        projects.reduce(
            (sum, p) =>
                sum + p.estimated_duration,
            0,
        );
    const sumActualDuration =
        projects.reduce(
            (sum, p) =>
                sum + p.actual_duration,
            0,
        );
    const sumEstimatedCost =
        projects.reduce(
            (sum, p) =>
                sum + p.estimated_cost,
            0,
        );
    const sumActualCost =
        projects.reduce(
            (sum, p) =>
                sum + p.actual_cost,
            0,
        );
    const sumEstimatedImpact =
        projects.reduce(
            (sum, p) =>
                sum + p.estimated_impact,
            0,
        );
    const sumActualImpact =
        projects.reduce(
            (sum, p) =>
                sum + p.actual_impact,
            0,
        );

    const baselineDays =
        durationInDays(sumEstimatedDuration);
    const currentDays =
        durationInDays(sumActualDuration);
    const estCost =
        Math.ceil(sumEstimatedCost);
    const actCost =
        Math.ceil(sumActualCost);
    const maxImpact = Math.max(
        sumEstimatedImpact,
        sumActualImpact,
    ) || 1;

    return [
        {
            title: 'Time',
            icon: 'clock',
            iconCssClass: 'text-success',
            theme: 'green',
            outer: {
                value: baselineDays,
                max: baselineDays,
                label: 'Baseline',
                display:
                    `${baselineDays}d`,
            },
            inner: {
                value: currentDays,
                max: baselineDays,
                label: 'Current',
                display:
                    `${currentDays}d`,
            },
            hasOverrunWarning: true,
        },
        {
            title: 'Cost',
            icon: 'dollarSign',
            iconCssClass: 'text-primary',
            theme: 'blue',
            outer: {
                value: estCost,
                max: estCost,
                label: 'Baseline',
                display:
                    formatCompactCurrency(
                        estCost,
                    ),
            },
            inner: {
                value: actCost,
                max: estCost,
                label: 'Current',
                display:
                    formatCompactCurrency(
                        actCost,
                    ),
            },
            hasOverrunWarning: true,
        },
        {
            title: 'Impact',
            icon: 'zap',
            iconCssClass: 'text-warning',
            theme: 'amber',
            outer: {
                value: sumEstimatedImpact,
                max: maxImpact,
                label: 'Baseline',
                display:
                    `${sumEstimatedImpact}`
                    + ` pts`,
            },
            inner: {
                value: sumActualImpact,
                max: maxImpact,
                label: 'Current',
                display:
                    `${sumActualImpact}`
                    + ` pts`,
            },
            hasOverrunWarning: false,
        },
    ];
}

export async function getDashboardStats(
): Promise<
    { label: string;
      value: number;
      trend: string }[]
> {
    const [ideas, projects, processes] =
        await Promise.all([
            GET<IdeaEntity[]>('ideas'),
            GET<ProjectEntity[]>('projects'),
            GET<FlowEntity[]>('processes'),
        ]);

    return [
        {
            label: 'Ideas',
            value: ideas
                .filter(isNotDeleted).length,
            trend: '',
        },
        {
            label: 'Projects',
            value: projects
                .filter(isNotDeleted).length,
            trend: '',
        },
        {
            label: 'Flow',
            value: processes.length,
            trend: '',
        },
    ];
}
