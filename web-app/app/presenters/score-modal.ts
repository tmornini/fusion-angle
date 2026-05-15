import { html, type SafeHtml } from '../safe-html.ts';
import type {
    ProjectEntity,
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
} from '../../../api/types.ts';

interface Definition {
    name: string;
    description: string;
}

export class ScoreModalPresenter {
    readonly #project: ProjectEntity;
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #latestBaselines:
        ProjectObjectiveBaselineScore[];

    constructor(
        project: ProjectEntity,
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        latestBaselines: ProjectObjectiveBaselineScore[],
    ) {
        this.#project = project;
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
        this.#latestBaselines = latestBaselines;
    }

    buildBody(): SafeHtml {
        const baselineMap = this.#latestBaselineMap();
        return html`
            <div class="score-modal-body">
                <h3>Score baselines: ${
                    this.#project.title}</h3>
                <p class="modal-subtitle">
                    Drag each slider to score this project
                    against the objective. Range: −100
                    to +100.
                </p>
                ${this.#activeObjectives.map(o =>
                    this.#sliderRow(
                        o, baselineMap.get(o.id),
                    ))
                }
                <div class="modal-actions">
                    <button data-action="cancel">
                        Cancel
                    </button>
                    <button data-action="save-baselines"
                        class="btn-primary">
                        Save baselines
                    </button>
                </div>
            </div>
        `;
    }

    #latestBaselineMap(): Map<ObjectiveId, number> {
        const latest = new Map<ObjectiveId,
            ProjectObjectiveBaselineScore>();
        for (const b of this.#latestBaselines) {
            const prev = latest.get(b.objective_id);
            if (!prev || b.scored_at > prev.scored_at) {
                latest.set(b.objective_id, b);
            }
        }
        const scores = new Map<ObjectiveId, number>();
        for (const [k, v] of latest) {
            scores.set(k, v.score);
        }
        return scores;
    }

    #sliderRow(
        obj: Objective,
        preFill: number | undefined,
    ): SafeHtml {
        const def = this.#defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${
                    obj.id}`,
            );
        }
        const isUnset = preFill === undefined;
        const value = preFill ?? 0;
        return html`
            <div class="score-slider-row"
                data-objective-id="${obj.id}"
                data-unset="${isUnset}"
                data-initial-value="${value}">
                <label class="score-slider-label">
                    <strong>${def.name}</strong>
                    <span class="score-slider-desc">
                        ${def.description}
                    </span>
                </label>
                <input type="range" min="-100" max="100"
                    step="1" value="${value}"
                    data-objective-id="${obj.id}"
                    class="score-slider${
                        isUnset ? ' unset' : ''
                    }">
                <span class="score-value">
                    ${isUnset ? '—' : value}
                </span>
                ${isUnset
                    ? html`<span class="score-hint">
                        Score required
                      </span>`
                    : html``}
            </div>
        `;
    }
}
