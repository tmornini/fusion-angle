import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import { ICON_SIZE, iconTrendingUp } from '../icons.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import type { TrendPoint } from
    '../adapters/project-scoring.ts';
import { formatDate } from '../format.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';

interface Definition {
    name: string;
    description: string;
}

interface Aggregate {
    objectiveId: ObjectiveId;
    baselineMean: number | undefined;
    latestActualMean: number | undefined;
    projectsBaselineScored: number;
    projectsActualScored: number;
}

// Sparkline geometry, in viewBox units. SPARK_PAD keeps
// the highest and lowest points off the top and bottom
// edges so their dots are not clipped.
const SPARK_HEIGHT = 30;
const SPARK_MID = SPARK_HEIGHT / 2;
const SPARK_PAD = 4;

type Direction = 'up' | 'down' | 'flat';

function directionForDelta(delta: number): Direction {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
}

export class DashboardObjectiveAggregatesPresenter {
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #aggregates: Aggregate[];
    readonly #trendlines: Map<ObjectiveId, TrendPoint[]>;

    constructor(
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        aggregates: Aggregate[],
        trendlines: Map<ObjectiveId, TrendPoint[]>,
    ) {
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
        this.#aggregates = aggregates;
        this.#trendlines = trendlines;
    }

    buildCard(): SafeHtml {
        const aggMap = new Map(
            this.#aggregates.map(
                a => [a.objectiveId, a],
            ),
        );
        return html`
            <div class="${
                'card gauge-card'
                + ' objective-aggregates-card'
            }">
                <div class="${
                    'flex items-center gap-3 mb-5'
                }">
                    <div class="icon-box">
                        ${iconTrendingUp(ICON_SIZE.xl, '')}
                    </div>
                    <h3 class="${
                        'text-sm font-semibold'
                    }">Objectives</h3>
                </div>
                <ul class="objective-aggregates-rows">
                    ${this.#activeObjectives.map(o =>
                        this.#row(o, aggMap.get(o.id)))
                    }
                </ul>
            </div>
        `;
    }

    #row(
        o: Objective,
        agg: Aggregate | undefined,
    ): SafeHtml {
        const def = this.#defs.get(o.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${o.id}`,
            );
        }
        const empty = !agg
            || agg.projectsBaselineScored === 0;
        const baseline = agg
            ? agg.baselineMean : undefined;
        const actual = agg
            ? agg.latestActualMean : undefined;
        const gauge = buildBipolarGaugeSvg(
            {
                value: baseline,
                label: 'Baseline',
                display: '',
            },
            {
                value: actual,
                label: 'Actual',
                display: '',
            },
            'objective-' + o.id,
            'small',
        );
        const points = this.#trendlines.get(o.id) ?? [];
        return html`
            <li class="score-row"
                data-objective-id="${o.id}"
                data-empty="${empty}">
                <span class="score-row-label">
                    ${def.name}
                </span>
                <span class="score-row-gauge">
                    ${gauge}
                </span>
                <span class="score-row-sparkline">
                    ${this.#sparkline(points)}
                </span>
            </li>
        `;
    }

    #sparkline(points: TrendPoint[]): SafeHtml {
        if (points.length === 0) {
            return html`
                <span class="sparkline-wrap">
                    <svg class="sparkline-svg"
                        viewBox="0 0 100 ${SPARK_HEIGHT}"
                        preserveAspectRatio="none">
                        ${this.#axis(SPARK_MID)}
                    </svg>
                </span>`;
        }
        const coords = this.#coords(points);
        const segments = coords.slice(1).map((c, i) => {
            const prev = coords[i]!;
            const dir = directionForDelta(
                points[i + 1]!.value - points[i]!.value,
            );
            return html`
                <line class="sparkline-seg"
                    data-direction="${dir}"
                    x1="${prev.x}" y1="${prev.y}"
                    x2="${c.x}" y2="${c.y}"
                    vector-effect="non-scaling-stroke"/>`;
        });
        const dots = coords.map((c, i) =>
            this.#dot(c.x, c.y, points, i));
        return html`
            <span class="sparkline-wrap">
                <svg class="sparkline-svg"
                    viewBox="0 0 100 ${SPARK_HEIGHT}"
                    preserveAspectRatio="none">
                    ${this.#axis(coords[0]!.y)}
                    ${segments}
                </svg>
                ${dots}
            </span>`;
    }

    #axis(y: number): SafeHtml {
        return html`
            <line class="sparkline-axis"
                x1="0" y1="${y}"
                x2="100" y2="${y}"/>`;
    }

    #coords(
        points: TrendPoint[],
    ): { x: number; y: number }[] {
        const values = points.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const span = max - min;
        const top = SPARK_PAD;
        const bottom = SPARK_HEIGHT - SPARK_PAD;
        return points.map((p, i) => ({
            x: points.length === 1
                ? 50
                : (i / (points.length - 1)) * 100,
            y: span === 0
                ? SPARK_MID
                : bottom
                    - ((p.value - min) / span)
                        * (bottom - top),
        }));
    }

    #dot(
        x: number,
        y: number,
        points: TrendPoint[],
        i: number,
    ): SafeHtml {
        const p = points[i]!;
        const date = formatDate(p.at);
        const xPct = x.toFixed(2);
        const yPct = (y / SPARK_HEIGHT * 100).toFixed(2);
        const tip = i === 0
            ? this.#baselineTip(date, p.value)
            : this.#changeTip(date, p, points[i - 1]!);
        const label = i === 0
            ? `Baseline ${date}, value ${p.value}`
            : `${date}, change `
                + formatSigned(
                    p.value - points[i - 1]!.value,
                );
        const directionAttr = i === 0
            ? html``
            : html`data-direction="${directionForDelta(
                p.value - points[i - 1]!.value,
            )}"`;
        return html`
            <span class="spark-dot" role="img"
                ${directionAttr}
                style="${`--x:${xPct}%;--y:${yPct}%`}"
                tabindex="0"
                aria-label="${label}">
                ${tip}
            </span>`;
    }

    #baselineTip(
        date: string,
        value: number,
    ): SafeHtml {
        return html`
            <span class="spark-tip" aria-hidden="true">
                <span class="spark-tip-date">${
                    date
                }</span>
                <span class="spark-tip-base">${
                    `Baseline · ${value}`
                }</span>
            </span>`;
    }

    #changeTip(
        date: string,
        p: TrendPoint,
        prev: TrendPoint,
    ): SafeHtml {
        const change = p.value - prev.value;
        return html`
            <span class="spark-tip" aria-hidden="true">
                <span class="spark-tip-date">${
                    date
                }</span>
                <span class="spark-tip-change"
                    data-tone="${toneForScore(change)}">${
                    formatSigned(change)
                }</span>
            </span>`;
    }
}
