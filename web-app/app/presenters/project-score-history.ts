import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Id,
    ObjectiveId,
} from '../../../api/types.ts';
import type {
    ObjectiveArchivalEvent,
    ObjectiveRevision,
} from '../adapters/objectives.ts';
import type {
    ObjectiveScore,
} from '../adapters/project-scoring.ts';
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

export type MemberNameResolver = (
    memberId: Id,
) => string;

type Event =
    | { kind: 'baseline'; at: string; memberId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'actual'; at: string; memberId: Id;
        objectiveId: ObjectiveId; score: number }
    | { kind: 'revision'; at: string; memberId: Id;
        objectiveId: ObjectiveId; name: string }
    | { kind: 'archival'; at: string; memberId: Id;
        objectiveId: ObjectiveId };

export class ProjectScoreHistoryPresenter {
    readonly #baselines: ObjectiveScore[];
    readonly #actuals: ObjectiveScore[];
    readonly #revisions: ObjectiveRevision[];
    readonly #archivals: ObjectiveArchivalEvent[];
    readonly #resolver: DefinitionResolver;
    readonly #memberName: MemberNameResolver;

    constructor(
        baselines: ObjectiveScore[],
        actuals: ObjectiveScore[],
        revisions: ObjectiveRevision[],
        archivals: ObjectiveArchivalEvent[],
        resolver: DefinitionResolver,
        memberName: MemberNameResolver,
    ) {
        this.#baselines = baselines;
        this.#actuals = actuals;
        this.#revisions = revisions;
        this.#archivals = archivals;
        this.#resolver = resolver;
        this.#memberName = memberName;
    }

    buildBody(): SafeHtml {
        const events = this.#mergedEvents();
        return html`
            <div class="score-history-body">
                <h3 id="history-title">Scoring history</h3>
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
                memberId: b.memberId,
                objectiveId: b.objectiveId,
                score: b.score,
            });
        }
        for (const a of this.#actuals) {
            events.push({
                kind: 'actual',
                at: a.at,
                memberId: a.memberId,
                objectiveId: a.objectiveId,
                score: a.score,
            });
        }
        for (const r of this.#revisions) {
            events.push({
                kind: 'revision',
                at: r.at,
                memberId: r.memberId,
                objectiveId: r.objectiveId,
                name: r.name,
            });
        }
        for (const d of this.#archivals) {
            events.push({
                kind: 'archival',
                at: d.at,
                memberId: d.memberId,
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
            this.#memberName(e.memberId)
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
