import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Id,
    ObjectiveId,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import type {
    ObjectiveArchivalEvent,
} from '../adapters/objectives.ts';
import {
    formatSigned,
    toneForScore,
} from '../scoring-format.ts';
import { formatDateTime } from '../core.ts';
import { DISPLAY_ABSENT } from '../format.ts';

export type DefinitionResolver = (
    objectiveId: ObjectiveId,
    atTime: string,
) => { name: string; description: string } | undefined;

export type WorkerNameResolver = (
    workerId: Id,
) => string;

type Event =
    | { kind: 'baseline'; at: string; workerId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'actual'; at: string; workerId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'revision'; at: string; workerId: Id;
        objectiveId: ObjectiveId; name: string }
    | { kind: 'archival'; at: string; workerId: Id;
        objectiveId: ObjectiveId };

export class ProjectScoreHistoryPresenter {
    readonly #baselines: ProjectObjectiveBaselineScore[];
    readonly #actuals: ProjectObjectiveActualScore[];
    readonly #revisions: ObjectiveRevision[];
    readonly #archivations: ObjectiveArchivalEvent[];
    readonly #resolver: DefinitionResolver;
    readonly #workerName: WorkerNameResolver;

    constructor(
        baselines: ProjectObjectiveBaselineScore[],
        actuals: ProjectObjectiveActualScore[],
        revisions: ObjectiveRevision[],
        archivations: ObjectiveArchivalEvent[],
        resolver: DefinitionResolver,
        workerName: WorkerNameResolver,
    ) {
        this.#baselines = baselines;
        this.#actuals = actuals;
        this.#revisions = revisions;
        this.#archivations = archivations;
        this.#resolver = resolver;
        this.#workerName = workerName;
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
                            <th>Who</th>
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
                at: b.at,
                workerId: b.worker_id,
                objectiveId: b.objective_id,
                score: b.score,
            });
        }
        for (const a of this.#actuals) {
            events.push({
                kind: 'actual',
                at: a.at,
                workerId: a.worker_id,
                objectiveId: a.objective_id,
                score: a.score,
            });
        }
        for (const r of this.#revisions) {
            events.push({
                kind: 'revision',
                at: r.at,
                workerId: r.worker_id,
                objectiveId: r.objective_id,
                name: r.name,
            });
        }
        for (const d of this.#archivations) {
            events.push({
                kind: 'archival',
                at: d.at,
                workerId: d.workerId,
                objectiveId: d.objectiveId,
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
        const whoCell = html`<td>${
            this.#workerName(e.workerId)
        }</td>`;
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
                    ${whoCell}
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
                    ${whoCell}
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
                    ${whoCell}
                    <td>Objective revised</td>
                    <td>${e.name}</td>
                    <td>renamed/edited</td>
                </tr>`;
            case 'archival': {
                const def = this.#resolver(
                    e.objectiveId, e.at,
                );
                return html`<tr>
                    ${dateCell}
                    ${whoCell}
                    <td>Objective archived</td>
                    <td>${def?.name ?? DISPLAY_ABSENT}</td>
                    <td>${DISPLAY_ABSENT}</td>
                </tr>`;
            }
        }
    }
}
