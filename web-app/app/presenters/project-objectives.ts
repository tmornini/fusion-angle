import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import {
    latestPerPair,
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';

interface Definition {
    name: string;
    description: string;
}

function indexByObjective<T extends {
    objective_id: ObjectiveId;
    project_id: string;
    scored_at: string;
}>(rows: readonly T[]): Map<ObjectiveId, T> {
    const map = new Map<ObjectiveId, T>();
    for (const r of latestPerPair(rows)) {
        map.set(r.objective_id, r);
    }
    return map;
}

export class ProjectObjectivesPresenter {
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #latestBaselines:
        ProjectObjectiveBaselineScore[];
    readonly #latestActuals:
        ProjectObjectiveActualScore[];

    constructor(
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        latestBaselines: ProjectObjectiveBaselineScore[],
        latestActuals: ProjectObjectiveActualScore[],
    ) {
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
        this.#latestBaselines = latestBaselines;
        this.#latestActuals = latestActuals;
    }

    buildSection(): SafeHtml {
        const baseMap =
            indexByObjective(this.#latestBaselines);
        const actualMap =
            indexByObjective(this.#latestActuals);

        if (baseMap.size === 0) {
            return html`
                <section
                    class="project-objectives-section">
                    <header>
                        <h3>Objectives</h3>
                    </header>
                    <p class="empty-state">
                        Project not yet scored.
                    </p>
                </section>
            `;
        }

        return html`
            <section
                class="project-objectives-section">
                <header>
                    <h3>Objectives</h3>
                    <button data-action="view-history">
                        View history
                    </button>
                </header>
                <ul class="project-objectives-list">
                    ${this.#activeObjectives.map(o => {
                        const b = baseMap.get(o.id);
                        if (!b) return html``;
                        return this.#row(
                            o, b.score,
                            actualMap.get(o.id),
                        );
                    })}
                </ul>
            </section>
        `;
    }

    #row(
        obj: Objective,
        baselineScore: number,
        actual:
            ProjectObjectiveActualScore | undefined,
    ): SafeHtml {
        const def = this.#defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing for `
                    + `${obj.id}`,
            );
        }
        const hasActual = actual !== undefined;
        const barStyle = hasActual
            ? `--baseline:${baselineScore};`
                + `--actual:${actual.score}`
            : `--baseline:${baselineScore}`;
        return html`
            <li class="score-row"
                data-objective-id="${obj.id}">
                <span class="score-row-label">
                    ${def.name}
                </span>
                <span class="bipolar-bar"
                    data-tone="${
                        toneForScore(baselineScore)}"
                    data-has-actual="${hasActual}"
                    style="${barStyle}">
                </span>
                <strong class="score-row-baseline"
                    data-tone="${
                        toneForScore(baselineScore)}">
                    ${formatSigned(baselineScore)}
                </strong>
                <strong class="score-row-actual"
                    data-tone="${actual
                        ? toneForScore(actual.score)
                        : 'neutral'}">
                    ${actual
                        ? formatSigned(actual.score)
                        : 'no measurements yet'}
                </strong>
            </li>
        `;
    }
}
