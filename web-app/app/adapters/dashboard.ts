import { GET } from '../../../api/api.ts';
import type {
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
} from '../../../api/types.ts';
import {
    ideaIsVisible,
    projectIsApproved,
    projectIsNotDeleted,
    MS_PER_DAY,
} from '../../../api/types.ts';
import {
    formatCompactCurrency,
} from '../format.ts';
import type { FetchContext } from './shared.ts';

export type GaugeIcon =
    | 'clock'
    | 'dollarSign'
    | 'zap';

export type GaugeTheme =
    | 'blue'
    | 'green'
    | 'amber';

export interface ArcData {
    readonly value: number;
    readonly max: number;
    readonly label: string;
    readonly display: string;
}

export interface GaugeData {
    readonly title: string;
    readonly icon: GaugeIcon;
    readonly iconCssClass: string;
    readonly theme: GaugeTheme;
    readonly outer: ArcData;
    readonly inner: ArcData;
    readonly isOverrunning: boolean;
}

function sumBy<T>(
    items: readonly T[],
    pick: (item: T) => number,
): number {
    return items.reduce(
        (acc, item) => acc + pick(item),
        0,
    );
}

export async function getDashboardGauges(
    ctx?: FetchContext,
): Promise<GaugeData[]> {
    const allProjects = ctx
        ? await ctx.getProjectRows()
        : await GET<ProjectEntity[]>(
            'projects',
        );
    const projects = allProjects.filter(
        projectIsApproved,
    );

    const msPerDay = MS_PER_DAY;
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
            Math.floor(
                (now - start) / msPerDay,
            ),
        );
    }
    const sumEstimatedCost =
        sumBy(projects, p => p.estimated_cost);
    const sumActualCost =
        sumBy(projects, p => p.actual_cost);
    const sumEstimatedImpact =
        sumBy(projects, p => p.estimated_impact);
    const sumActualImpact =
        sumBy(projects, p => p.actual_impact);

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
            isOverrunning: true,
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
            isOverrunning: true,
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
            isOverrunning: false,
        },
    ];
}

export async function getDashboardStats(
    ctx?: FetchContext,
): Promise<
    { label: string; value: number }[]
> {
    const [ideas, projects, flows] =
        await Promise.all([
            ctx
                ? ctx.getIdeaRows()
                : GET<IdeaEntity[]>('ideas'),
            ctx
                ? ctx.getProjectRows()
                : GET<ProjectEntity[]>(
                    'projects',
                ),
            ctx
                ? ctx.getFlowRows()
                : GET<FlowEntity[]>('flows'),
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
