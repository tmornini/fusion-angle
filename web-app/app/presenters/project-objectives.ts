import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
    ProjectState,
} from '../../../api/types.ts';
import type {
    ObjectiveScore,
} from '../adapters/project-scoring.ts';
import {
    latestPerPair,
    formatSigned,
} from '../scoring-format.ts';
import { iconTrendingUp } from '../icons.ts';
import { buildBipolarGaugeSvg } from './gauge.ts';
import { formatDate } from '../format.ts';

interface Definition {
    name: string;
    description: string;
}

function indexByObjective<T extends {
    id: string;
    objectiveId: ObjectiveId;
    projectId: string;
    at: string;
}>(rows: readonly T[]): Map<ObjectiveId, T> {
    const map = new Map<ObjectiveId, T>();
    for (const r of latestPerPair(rows)) {
        map.set(r.objectiveId, r);
    }
    return map;
}

function baselineEditable(state: ProjectState): boolean {
    return state === 'submitted'
        || state === 'under-review'
        || state === 'sent-back';
}

// The Actual slider supersedes Baseline only once the project
// is approved and actual measurements can be recorded; before
// then the two are mutually exclusive on Baseline.
function actualVisible(state: ProjectState): boolean {
    return state === 'approved';
}

export class ProjectObjectivesPresenter {
    readonly #activeObjectives: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #latestBaselines: ObjectiveScore[];
    readonly #latestActuals: ObjectiveScore[];
    readonly #state: ProjectState;

    constructor(
        activeObjectives: Objective[],
        defs: Map<ObjectiveId, Definition>,
        latestBaselines: ObjectiveScore[],
        latestActuals: ObjectiveScore[],
        state: ProjectState,
    ) {
        this.#activeObjectives = activeObjectives;
        this.#defs = defs;
        this.#latestBaselines = latestBaselines;
        this.#latestActuals = latestActuals;
        this.#state = state;
    }

    buildSection(): SafeHtml {
        const baseMap =
            indexByObjective(this.#latestBaselines);
        const actualMap =
            indexByObjective(this.#latestActuals);

        const showActual = actualVisible(this.#state);
        const baseEditable =
            baselineEditable(this.#state);
        const anyEditable =
            showActual || baseEditable;

        return html`
            <div class="${
                'card gauge-card'
                + ' project-objectives-card'
            }">
                <div class="${
                    'flex items-center'
                    + ' gap-3 mb-5'
                }">
                    <div class="icon-box">
                        ${iconTrendingUp(20, '')}
                    </div>
                    <h3 class="${
                        'text-sm font-semibold'
                    }">Objectives</h3>
                </div>
                <ul class="project-objectives-rows">
                    ${this.#activeObjectives.map(o =>
                        this.#row(
                            o,
                            baseMap.get(o.id),
                            actualMap.get(o.id),
                            showActual,
                            baseEditable,
                        ))}
                </ul>
                ${anyEditable
                    ? html`<div
                        class="${
                            'project-objectives'
                            + '-footer'
                        }">
                        <button
                            data-action="save-objectives"
                            class="btn btn-primary"
                            disabled>
                            Save
                        </button>
                      </div>`
                    : html``}
            </div>
        `;
    }

    #row(
        obj: Objective,
        baseline: ObjectiveScore | undefined,
        actual: ObjectiveScore | undefined,
        showActual: boolean,
        baseEditable: boolean,
    ): SafeHtml {
        const def = this.#defs.get(obj.id);
        if (!def) {
            throw new Error(
                `objective definition missing for `
                    + `${obj.id}`,
            );
        }
        const baseValue = baseline?.score ?? 0;
        const actValue = actual?.score ?? baseValue;
        const lastActualText =
            actual !== undefined
                ? `${formatSigned(actual.score)} `
                    + `(${formatDate(actual.at)})`
                : 'none yet';
        const baselineText =
            baseline !== undefined
                ? formatSigned(baseline.score)
                : 'unset';

        return html`
            <li class="project-objective-row"
                data-objective-id="${obj.id}">
                <div class="${
                    'project-objective-header'
                }">
                    <span
                        class="${
                            'project-objective-name'
                        }"
                    >${def.name}</span>
                </div>
                <div class="${
                    'project-objective-gauge'
                }">
                    ${buildBipolarGaugeSvg(
                        {
                            value: baseline?.score,
                            label: 'Baseline',
                            display: baselineText,
                        },
                        {
                            value: actual?.score,
                            label: 'Actual',
                            display: lastActualText,
                        },
                        'project-objective-'
                            + obj.id,
                        'small',
                    )}
                </div>
                ${showActual
                    ? html`<div class="${
                        'project-objective-slider'
                    }"
                        data-slider="actual">
                        <label class="${
                            'text-xs text-muted'
                        }"
                            for="${
                                'objective-slider-'
                                + obj.id
                            }">Actual</label>
                        <input type="range"
                            min="-100" max="100"
                            step="1"
                            id="${
                                'objective-slider-'
                                + obj.id
                            }"
                            value="${actValue}"
                            data-initial-value="${
                                actValue
                            }"
                            class="actual-slider"
                            ${baseline === undefined
                                ? 'disabled'
                                : ''}>
                        <span class="slider-value">
                            ${actual !== undefined
                                ? formatSigned(
                                    actual.score)
                                : '—'}
                        </span>
                      </div>`
                    : html`<div class="${
                        'project-objective-slider'
                    }"
                        data-slider="baseline">
                        <label class="${
                            'text-xs text-muted'
                        }"
                            for="${
                                'objective-slider-'
                                + obj.id
                            }">Baseline</label>
                        <input type="range"
                            min="-100" max="100"
                            step="1"
                            id="${
                                'objective-slider-'
                                + obj.id
                            }"
                            value="${baseValue}"
                            data-initial-value="${
                                baseValue
                            }"
                            class="baseline-slider"
                            ${!baseEditable
                                ? 'disabled'
                                : ''}>
                        <span class="slider-value">
                            ${baseline !== undefined
                                ? formatSigned(
                                    baseline.score)
                                : '—'}
                        </span>
                      </div>`}
                <small class="${
                    'project-objective-caption'
                }">
                    Last actual: ${lastActualText}
                </small>
            </li>
        `;
    }
}
