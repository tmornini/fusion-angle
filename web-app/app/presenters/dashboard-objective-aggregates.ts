import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

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

function toneFor(v: number | undefined): string {
    return v === undefined
        ? 'neutral'
        : toneForScore(v);
}

function displaySigned(v: number | undefined): string {
    return v === undefined
        ? DISPLAY_ABSENT
        : formatSigned(v);
}

export class DashboardObjectiveAggregatesPresenter {
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #aggregates: Aggregate[];

    constructor(
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        aggregates: Aggregate[],
    ) {
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
        this.#aggregates = aggregates;
    }

    buildCard(): SafeHtml {
        const aggMap = new Map(
            this.#aggregates.map(
                a => [a.objectiveId, a],
            ),
        );
        return html`
            <section class="objective-aggregates-card">
                <header>
                    <h3>
                        Active project impact by objective
                    </h3>
                </header>
                <ul class="objective-aggregates-rows">
                    ${this.#activeObjectives.map(o =>
                        this.#row(o, aggMap.get(o.id)))
                    }
                </ul>
            </section>
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
        const hasBaseline = baseline !== undefined;
        const hasActual = actual !== undefined;
        const styleParts: string[] = [];
        if (hasBaseline) {
            styleParts.push(`--baseline:${baseline}`);
        }
        if (hasActual) {
            styleParts.push(`--actual:${actual}`);
        }
        const barStyle = styleParts.join(';');
        return html`
            <li class="score-row"
                data-objective-id="${o.id}"
                data-empty="${empty}">
                <span class="score-row-label">
                    ${def.name}
                </span>
                <span class="bipolar-bar"
                    data-tone="${toneFor(baseline)}"
                    data-has-baseline="${hasBaseline}"
                    data-has-actual="${hasActual}"
                    style="${barStyle}">
                </span>
                <strong class="score-row-baseline"
                    data-tone="${toneFor(baseline)}">
                    ${displaySigned(baseline)}
                </strong>
                <strong class="score-row-actual"
                    data-tone="${toneFor(actual)}">
                    ${displaySigned(actual)}
                </strong>
                <span class="score-row-count">
                    ${agg
                        ? agg.projectsBaselineScored
                        : 0} projects
                </span>
            </li>
        `;
    }
}
