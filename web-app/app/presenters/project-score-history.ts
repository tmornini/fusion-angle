import { html, type SafeHtml } from '../safe-html.ts';
import type {
    ObjectiveId,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { formatDateTime } from '../core.ts';

export type DefinitionResolver = (
    objectiveId: ObjectiveId,
    atTime: string,
) => { name: string; description: string } | undefined;

type Event =
    | { kind: 'baseline'; at: string;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'actual'; at: string;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'revision'; at: string;
        objectiveId: ObjectiveId; name: string }
    | { kind: 'deprecation'; at: string;
        objectiveId: ObjectiveId };

export class ProjectScoreHistoryPresenter {
    readonly #baselines: ProjectObjectiveBaselineScore[];
    readonly #actuals: ProjectObjectiveActualScore[];
    readonly #revisions: ObjectiveRevision[];
    readonly #deprecations: DeprecatedObjective[];
    readonly #resolver: DefinitionResolver;

    constructor(
        baselines: ProjectObjectiveBaselineScore[],
        actuals: ProjectObjectiveActualScore[],
        revisions: ObjectiveRevision[],
        deprecations: DeprecatedObjective[],
        resolver: DefinitionResolver,
    ) {
        this.#baselines = baselines;
        this.#actuals = actuals;
        this.#revisions = revisions;
        this.#deprecations = deprecations;
        this.#resolver = resolver;
    }

    buildBody(): SafeHtml {
        const events = this.#mergedEvents();
        return html`
            <div class="score-history-body">
                <h3>Scoring history</h3>
                <table class="score-history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Event</th>
                            <th>Objective</th>
                            <th>Detail</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(e => this.#row(e))}
                    </tbody>
                </table>
            </div>
        `;
    }

    #mergedEvents(): Event[] {
        const events: Event[] = [];
        for (const b of this.#baselines) {
            events.push({
                kind: 'baseline',
                at: b.scored_at,
                objectiveId: b.objective_id,
                score: b.score,
            });
        }
        for (const a of this.#actuals) {
            events.push({
                kind: 'actual',
                at: a.scored_at,
                objectiveId: a.objective_id,
                score: a.score,
            });
        }
        for (const r of this.#revisions) {
            events.push({
                kind: 'revision',
                at: r.revised_at,
                objectiveId: r.objective_id,
                name: r.name,
            });
        }
        for (const d of this.#deprecations) {
            events.push({
                kind: 'deprecation',
                at: d.deprecated_at,
                objectiveId: d.objective_id,
            });
        }
        events.sort((a, b) => a.at.localeCompare(b.at));
        return events;
    }

    #row(e: Event): SafeHtml {
        const dateLabel = formatDateTime(e.at);
        const dateCell = html`<td>
            <time datetime="${e.at}">${dateLabel}</time>
        </td>`;
        switch (e.kind) {
            case 'baseline': {
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                if (!def) {
                    throw new Error(
                        `objective definition missing `
                        + `for ${e.objectiveId} at `
                        + `${e.at}`,
                    );
                }
                return html`<tr>
                    ${dateCell}
                    <td>Baseline scored</td>
                    <td>${def.name}</td>
                    <td data-tone="${toneForScore(e.score)}">${
                        formatSigned(e.score)
                    }</td>
                </tr>`;
            }
            case 'actual': {
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                if (!def) {
                    throw new Error(
                        `objective definition missing `
                        + `for ${e.objectiveId} at `
                        + `${e.at}`,
                    );
                }
                return html`<tr>
                    ${dateCell}
                    <td>Actual measured</td>
                    <td>${def.name}</td>
                    <td data-tone="${toneForScore(e.score)}">${
                        formatSigned(e.score)
                    }</td>
                </tr>`;
            }
            case 'revision':
                return html`<tr>
                    ${dateCell}
                    <td>Objective revised</td>
                    <td>—</td>
                    <td>renamed/edited</td>
                </tr>`;
            case 'deprecation':
                return html`<tr>
                    ${dateCell}
                    <td>Objective deprecated</td>
                    <td>—</td>
                    <td>—</td>
                </tr>`;
        }
    }
}
