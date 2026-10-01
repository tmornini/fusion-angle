import {
    ideaIsVisible,
    projectStateIsApproved,
    projectStateIsNotDeleted,
    assertIdeaState,
    assertProjectState,
    MS_PER_DAY,
} from '../../shared/types.ts';
import {
    formatCompactCurrency,
    DISPLAY_ABSENT,
} from './format.ts';
import { formatSigned } from './scoring-format.ts';
import type { RequestContext } from '../../client/request-context.ts';
import { getIdeaEntities } from '../../client/ideas.ts';
import { getProjectEntities } from '../../client/projects.ts';
import { getFlowEntities } from '../../client/flows.ts';
import {
    type DashboardScoringBundle,
} from '../../client/project-scoring.ts';
import { getPortfolioImpactSummary } from './scoring-aggregate.ts';

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

export function getDashboardGauges(
    bundle: DashboardScoringBundle,
): GaugeData[] {
    // Lifecycle state rides the project GET row
    // (Phase A stamp) — no second hop.
    const impact = getPortfolioImpactSummary(bundle);
    const projects = bundle.projects.filter(p =>
        projectStateIsApproved(
            assertProjectState(
                p.state, 'project ' + p.id,
            ),
        ),
    );

    const msPerDay = MS_PER_DAY;
    const now = Date.now();
    let sumBaselineDays = 0;
    let sumActualDays = 0;
    let sumEstimatedCost = 0;
    let sumActualCost = 0;
    // Both dates are gate-validated calendar dates
    // (validateCalendarDateField) — parse cannot fail, so
    // no project is silently dropped from the aggregate.
    for (const p of projects) {
        sumEstimatedCost += p.estimated_cost;
        sumActualCost += p.actual_cost;
        const start = new Date(
            p.start_date,
        ).getTime();
        const end = new Date(
            p.target_end_date,
        ).getTime();
        sumBaselineDays += Math.max(
            0,
            Math.ceil(
                (end - start)
                / msPerDay,
            ),
        );
        sumActualDays += Math.max(
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
                value: sumActualDays,
                max: sumBaselineDays,
                label: 'Actual',
                display:
                    `${sumActualDays}d`,
            },
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
                label: 'Actual',
                display:
                    formatCompactCurrency(
                        actCost,
                    ),
            },
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
    // Header counts (header-info.ts on every sidebar
    // page) read lifecycle from the entity GET rows
    // already fetched — two fewer requests.
    const [ideas, projects, flows] =
        await Promise.all([
            getIdeaEntities(ctx),
            getProjectEntities(ctx),
            getFlowEntities(ctx),
        ]);

    return [
        {
            label: 'Ideas',
            value: ideas.map(m => m.body().toValue()).filter(row =>
                ideaIsVisible(
                    assertIdeaState(
                        row.state,
                        'idea ' + row.id,
                    ),
                ),
            ).length,
        },
        {
            label: 'Projects',
            value: projects.filter(p =>
                projectStateIsNotDeleted(
                    assertProjectState(
                        p.state,
                        'project ' + p.id,
                    ),
                ),
            ).length,
        },
        {
            label: 'Flows',
            value: flows.length,
        },
    ];
}
