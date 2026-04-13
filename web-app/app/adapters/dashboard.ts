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
    MS_PER_DAY,
} from '../../../api/types';
import {
    formatCompactCurrency,
} from '../format';

export type GaugeIcon =
    | 'clock'
    | 'dollarSign'
    | 'zap';

export type GaugeTheme =
    | 'blue'
    | 'green'
    | 'amber';

export interface GaugeReceiver {
    title(text: string): void;
    theme(name: GaugeTheme): void;
    icon(
        name: GaugeIcon,
        cssClass: string,
    ): void;
    outerArc(
        value: number,
        max: number,
        label: string,
        display: string,
    ): void;
    innerArc(
        value: number,
        max: number,
        label: string,
        display: string,
    ): void;
    overrunWarning(
        enabled: boolean,
    ): void;
}

interface ArcData {
    readonly value: number;
    readonly max: number;
    readonly label: string;
    readonly display: string;
}

interface GaugeCardInit {
    readonly title: string;
    readonly icon: GaugeIcon;
    readonly iconCssClass: string;
    readonly theme: GaugeTheme;
    readonly outer: ArcData;
    readonly inner: ArcData;
    readonly hasOverrunWarning: boolean;
}

export class GaugeCard {
    readonly #title: string;
    readonly #icon: GaugeIcon;
    readonly #iconCssClass: string;
    readonly #theme: GaugeTheme;
    readonly #outer: ArcData;
    readonly #inner: ArcData;
    readonly #hasOverrunWarning: boolean;

    constructor(init: GaugeCardInit) {
        this.#title = init.title;
        this.#icon = init.icon;
        this.#iconCssClass =
            init.iconCssClass;
        this.#theme = init.theme;
        this.#outer = init.outer;
        this.#inner = init.inner;
        this.#hasOverrunWarning =
            init.hasOverrunWarning;
    }

    presentGaugeInto(
        r: GaugeReceiver,
    ): void {
        r.title(this.#title);
        r.theme(this.#theme);
        r.icon(
            this.#icon,
            this.#iconCssClass,
        );
        r.outerArc(
            this.#outer.value,
            this.#outer.max,
            this.#outer.label,
            this.#outer.display,
        );
        r.innerArc(
            this.#inner.value,
            this.#inner.max,
            this.#inner.label,
            this.#inner.display,
        );
        r.overrunWarning(
            this.#hasOverrunWarning,
        );
    }
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
        new GaugeCard({
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
        }),
        new GaugeCard({
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
        }),
        new GaugeCard({
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
        }),
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
