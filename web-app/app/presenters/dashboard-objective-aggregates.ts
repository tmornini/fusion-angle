import { html, type SafeHtml } from '../safe-html.ts';
import type { HttpMessage } from
    '../../../shared/http-message/http-message.ts';
import type {
    ObjectiveEntity,
    ObjectiveId,
} from '../../../shared/types.ts';
import { ICON_SIZE, iconTrendingUp } from '../icons.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import type { TrendPoint } from '../scoring-aggregate.ts';
import { buildSparkline } from './sparkline.ts';

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

export class DashboardObjectiveAggregatesPresenter {
    readonly #activeObjectives: HttpMessage<ObjectiveEntity>[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #aggregates: Aggregate[];
    readonly #trendlines: Map<ObjectiveId, TrendPoint[]>;

    constructor(
        activeObjectives: HttpMessage<ObjectiveEntity>[],
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
                    ${this.#activeObjectives
                        .map(m => m.body().toValue())
                        .map(o => this.#row(o, aggMap.get(o.id)))
                    }
                </ul>
            </div>
        `;
    }

    #row(
        o: ObjectiveEntity,
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
                data-empty="${empty}"
                tabindex="0">
                <span class="score-row-label">
                    ${def.name}
                </span>
                <span class="score-row-gauge">
                    ${gauge}
                </span>
                <span class="score-row-sparkline">
                    ${buildSparkline(points)}
                </span>
            </li>
        `;
    }
}
