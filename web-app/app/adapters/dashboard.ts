import { GET } from '../../../api/api';
import type {
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
} from '../../../api/types';
import {
    ideaIsVisible,
    projectIsApproved,
    projectIsNotDeleted,
    SECONDS_PER_DAY,
} from '../../../api/types';
import {
    formatCompactCurrency,
} from '../format';

export type GaugeIcon =
    | 'clock'
    | 'dollarSign'
    | 'zap';

export interface GaugeCard {
    title: string;
    icon: GaugeIcon;
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
        projectIsApproved,
    );

    const msPerDay =
        SECONDS_PER_DAY * 1000;
    const now = Date.now();
    let sumBaselineDays = 0;
    let sumCurrentDays = 0;
    for (const p of projects) {
        const start = new Date(
            p.start_date,
        ).getTime();
        if (isNaN(start)) continue;
        const end = new Date(
            p.target_end_date,
        ).getTime();
        if (!isNaN(end)) {
            sumBaselineDays += Math.max(
                0,
                Math.ceil(
                    (end - start)
                    / msPerDay,
                ),
            );
        }
        sumCurrentDays += Math.max(
            0,
            Math.ceil(
                (now - start) / msPerDay,
            ),
        );
    }
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

    const estCost =
        Math.ceil(sumEstimatedCost);
    const actCost =
        Math.ceil(sumActualCost);
    const maxImpact = Math.max(
        sumEstimatedImpact,
        sumActualImpact,
    );

    return [
        {
            title: 'Time',
            icon: 'clock',
            iconCssClass: 'text-success',
            theme: 'green',
            outer: {
                value: sumBaselineDays,
                max: sumBaselineDays,
                label: 'Baseline',
                display:
                    `${sumBaselineDays}d`,
            },
            inner: {
                value: sumCurrentDays,
                max: sumBaselineDays,
                label: 'Current',
                display:
                    `${sumCurrentDays}d`,
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
    { label: string; value: number }[]
> {
    const [ideas, projects, flows] =
        await Promise.all([
            GET<IdeaEntity[]>('ideas'),
            GET<ProjectEntity[]>('projects'),
            GET<FlowEntity[]>(
                'flows',
            ),
        ]);

    return [
        {
            label: 'Ideas',
            value: ideas
                .filter(ideaIsVisible)
                .length,
        },
        {
            label: 'Projects',
            value: projects
                .filter(projectIsNotDeleted)
                .length,
        },
        {
            label: 'Flows',
            value: flows.length,
        },
    ];
}
