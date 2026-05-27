import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import { iconTrendingUp } from '../icons.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';

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

function clamp(
    v: number, lo: number, hi: number,
): number {
    return Math.max(lo, Math.min(hi, v));
}

export class DashboardObjectiveAggregatesPresenter {
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #aggregates: Aggregate[];
    readonly #trendlines: Map<ObjectiveId, number[]>;

    constructor(
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        aggregates: Aggregate[],
        trendlines: Map<ObjectiveId, number[]>,
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
                        ${iconTrendingUp(20, '')}
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

    #sparkline(points: number[]): SafeHtml {
        const axis = html`
            <line class="sparkline-axis"
                x1="0" y1="15"
                x2="100" y2="15"/>`;
        if (points.length === 0) {
            return html`
                <svg viewBox="0 0 100 30"
                    preserveAspectRatio="none">
                    ${axis}
                </svg>`;
        }
        const coords = points.map((s, i) => ({
            x: points.length === 1
                ? 50
                : (i / (points.length - 1)) * 100,
            y: 15 - clamp(s, -100, 100) * 0.15,
        }));
        const pointsAttr = coords
            .map(c => `${c.x},${c.y}`)
            .join(' ');
        const polyline = points.length > 1
            ? html`
                <polyline class="sparkline-line"
                    points="${pointsAttr}"/>`
            : html``;
        const dots = coords.map(c => html`
            <circle class="sparkline-dot"
                cx="${c.x}" cy="${c.y}" r="1.5"/>`);
        return html`
            <svg viewBox="0 0 100 30"
                preserveAspectRatio="none">
                ${axis}
                ${polyline}
                ${dots}
            </svg>`;
    }
}
