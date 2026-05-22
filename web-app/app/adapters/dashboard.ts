import {
    ideaIsVisible,
    projectStateIsApproved,
    projectStateIsNotDeleted,
    MS_PER_DAY,
} from '../../../api/types.ts';
import {
    formatCompactCurrency,
    DISPLAY_ABSENT,
} from '../format.ts';
import { formatSigned } from '../scoring-format.ts';
import type { RequestContext } from './shared.ts';
import { getIdeaRows } from './ideas.ts';
import {
    getIdeaStates,
    getProjectStates,
} from './state-events.ts';
import { getProjectRows } from './projects.ts';
import { getFlowRows } from './flows.ts';
import {
    getPortfolioImpactSummary,
} from './project-scoring.ts';

export type GaugeIcon =
    | 'clock'
    | 'dollarSign'
    | 'zap';

export type GaugeTheme =
    | 'blue'
    | 'green'
    | 'amber';

export interface RatioArc {
    readonly value: number;
    readonly max: number;
    readonly label: string;
    readonly display: string;
}

export interface BipolarArc {
    readonly value: number | undefined;
    readonly label: string;
    readonly display: string;
}

export interface RatioGauge {
    readonly kind: 'ratio';
    readonly title: string;
    readonly icon: GaugeIcon;
    readonly iconCssClass: string;
    readonly theme: GaugeTheme;
    readonly outer: RatioArc;
    readonly inner: RatioArc;
    readonly isOverrunning: boolean;
}

export interface BipolarGauge {
    readonly kind: 'bipolar';
    readonly title: string;
    readonly icon: GaugeIcon;
    readonly iconCssClass: string;
    readonly theme: GaugeTheme;
    readonly outer: BipolarArc;
    readonly inner: BipolarArc;
}

export type GaugeData = RatioGauge | BipolarGauge;

export async function getDashboardGauges(
    ctx: RequestContext,
): Promise<GaugeData[]> {
    const [allProjects, projectStates, impact] =
        await Promise.all([
            getProjectRows(ctx),
            getProjectStates(ctx),
            getPortfolioImpactSummary(ctx),
        ]);
    const projects = allProjects.filter(p => {
        const s = projectStates.get(p.id);
        if (s === undefined) {
            throw new Error(
                'Project has no state event: '
                + p.id,
            );
        }
        return projectStateIsApproved(s);
    });

    const msPerDay = MS_PER_DAY;
    const now = Date.now();
    let sumBaselineDays = 0;
    let sumCurrentDays = 0;
    let sumEstimatedCost = 0;
    let sumActualCost = 0;
    for (const p of projects) {
        sumEstimatedCost += p.estimated_cost;
        sumActualCost += p.actual_cost;
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

    const estCost =
        Math.ceil(sumEstimatedCost);
    const actCost =
        Math.ceil(sumActualCost);

    const impactDisplay = (
        v: number | undefined,
    ): string =>
        v === undefined
            ? DISPLAY_ABSENT
            : formatSigned(v);

    return [
        {
            kind: 'ratio',
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
            kind: 'ratio',
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
            kind: 'bipolar',
            title: 'Impact',
            icon: 'zap',
            iconCssClass: 'text-warning',
            theme: 'amber',
            outer: {
                value: impact.baselineMean,
                label: 'Baseline',
                display: impactDisplay(
                    impact.baselineMean,
                ),
            },
            inner: {
                value: impact.actualMean,
                label: 'Actual',
                display: impactDisplay(
                    impact.actualMean,
                ),
            },
        },
    ];
}

export async function getDashboardStats(
    ctx: RequestContext,
): Promise<
    { label: string; value: number }[]
> {
    const [
        ideas, ideaStates, projects,
        projectStates, flows,
    ] = await Promise.all([
        getIdeaRows(ctx),
        getIdeaStates(ctx),
        getProjectRows(ctx),
        getProjectStates(ctx),
        getFlowRows(ctx),
    ]);

    return [
        {
            label: 'Ideas',
            value: ideas.filter(row => {
                const s = ideaStates.get(row.id);
                return s !== undefined
                    && ideaIsVisible(s);
            }).length,
        },
        {
            label: 'Projects',
            value: projects.filter(p => {
                const s = projectStates.get(p.id);
                return s !== undefined
                    && projectStateIsNotDeleted(s);
            }).length,
        },
        {
            label: 'Flows',
            value: flows.length,
        },
    ];
}
