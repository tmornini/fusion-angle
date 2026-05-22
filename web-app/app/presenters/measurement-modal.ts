import { html, type SafeHtml } from '../safe-html.ts';
import { formatDate } from '../format.ts';
import { latestPerPair } from '../scoring-format.ts';
import {
    type ProjectEntity,
    type ProjectState,
    type ObjectiveId,
    type ProjectObjectiveBaselineScore,
    type ProjectObjectiveActualScore,
    PROJECT_STATE_CONFIG,
    projectStateAllowsMeasurement,
} from '../../../api/types.ts';
import { iconInfo } from '../icons.ts';

interface Definition {
    name: string;
    description: string;
}

interface RowData {
    objectiveId: ObjectiveId;
    name: string;
    description: string;
    baselineScore: number;
    latestActualScore: number | undefined;
    latestActualAt: string | undefined;
    preFillValue: number;
}

export class MeasurementModalPresenter {
    readonly #project: ProjectEntity;
    readonly #state: ProjectState;
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #latestBaselines:
        ProjectObjectiveBaselineScore[];
    readonly #latestActuals:
        ProjectObjectiveActualScore[];

    constructor(
        project: ProjectEntity,
        state: ProjectState,
        defs: Map<ObjectiveId, Definition>,
        latestBaselines: ProjectObjectiveBaselineScore[],
        latestActuals: ProjectObjectiveActualScore[],
    ) {
        this.#project = project;
        this.#state = state;
        this.#defs = defs;
        this.#latestBaselines = latestBaselines;
        this.#latestActuals = latestActuals;
    }

    buildBody(): SafeHtml {
        const rows = this.#buildRows();
        if (!projectStateAllowsMeasurement(this.#state)) {
            return this.#buildGatedBody(rows);
        }
        return this.#buildActiveBody(rows);
    }

    #buildActiveBody(rows: RowData[]): SafeHtml {
        return html`
            <div class="measurement-modal-body">
                <h3>Log measurement: ${
                    this.#project.title}</h3>
                <p class="modal-subtitle">
                    Record current actual scores. Untouched
                    sliders are not recorded.
                </p>
                ${rows.map(r => this.#row(r, false))}
                <div class="modal-actions">
                    <button data-action="cancel">
                        Cancel
                    </button>
                    <button data-action="save-measurement"
                        class="btn-primary">
                        Save measurement
                    </button>
                </div>
            </div>
        `;
    }

    #buildGatedBody(rows: RowData[]): SafeHtml {
        const stateLabel =
            PROJECT_STATE_CONFIG[this.#state].label;
        return html`
            <div class="measurement-modal-body">
                <h3>Log measurement: ${
                    this.#project.title}</h3>
                <div class="empty-banner"
                    data-tone="warning">
                    <span class="empty-banner-icon">
                        ${iconInfo(20, '')}
                    </span>
                    <p class="text-sm m-0">
                        Logging measurements is only
                        available after the project is
                        approved. The project is
                        currently ${stateLabel}.
                    </p>
                </div>
                ${rows.map(r => this.#row(r, true))}
                <div class="modal-actions">
                    <button data-action="cancel">
                        Close
                    </button>
                </div>
            </div>
        `;
    }

    #buildRows(): RowData[] {
        const baselineMap = new Map(
            latestPerPair(this.#latestBaselines)
                .map(r => [r.objective_id, r]),
        );
        const actualMap = new Map(
            latestPerPair(this.#latestActuals)
                .map(r => [r.objective_id, r]),
        );
        const rows: RowData[] = [];
        for (const [objId, b] of baselineMap) {
            const a = actualMap.get(objId);
            const def = this.#defs.get(objId);
            if (!def) {
                throw new Error(
                    `objective definition missing for ${
                        objId}`,
                );
            }
            rows.push({
                objectiveId: objId,
                name: def.name,
                description: def.description,
                baselineScore: b.score,
                latestActualScore:
                    a ? a.score : undefined,
                latestActualAt:
                    a ? a.at : undefined,
                preFillValue: a ? a.score : b.score,
            });
        }
        return rows;
    }

    #row(r: RowData, disabled: boolean): SafeHtml {
        const actualText =
            r.latestActualScore !== undefined
            && r.latestActualAt !== undefined
                ? `${r.latestActualScore} (`
                    + `${formatDate(r.latestActualAt)})`
                : 'none yet';
        return html`
            <div class="measurement-slider-row"
                data-objective-id="${r.objectiveId}"
                data-initial-value="${r.preFillValue}"
                aria-disabled="${disabled}">
                <label>
                    <strong>${r.name}</strong>
                    <span class="meta">
                        ${r.description}
                    </span>
                </label>
                <input type="range" min="-100" max="100"
                    step="1" value="${r.preFillValue}"
                    data-objective-id="${r.objectiveId}"
                    ${disabled ? 'disabled' : ''}>
                <span class="measurement-value">
                    ${r.preFillValue}
                </span>
                <small class="measurement-caption">
                    Baseline: ${r.baselineScore} ·
                    Last actual: ${actualText}
                </small>
            </div>
        `;
    }
}
