import { html, type SafeHtml } from '../safe-html.ts';
import type {
    ObjectiveEntity,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    ICON_SIZE,
    iconEdit, iconArchive, iconPlus, iconUndo,
} from '../icons.ts';
import { formatDate } from '../format.ts';

interface Definition {
    name: string;
    description: string;
}

export class OrganizationObjectivesPresenter {
    readonly #active: ObjectiveEntity[];
    readonly #archived: ObjectiveEntity[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #archivedAt: Map<ObjectiveId, string>;

    constructor(
        active: ObjectiveEntity[],
        archived: ObjectiveEntity[],
        defs: Map<ObjectiveId, Definition>,
        archivedAt: Map<ObjectiveId, string>,
    ) {
        this.#active = active;
        this.#archived = archived;
        this.#defs = defs;
        this.#archivedAt = archivedAt;
    }

    buildBox(): SafeHtml {
        return html`
            <div class="card card-hover p-6 mt-6">
                ${this.#buildHeader()}
                ${this.#buildActiveList()}
                ${this.#buildArchivedList()}
            </div>
        `;
    }

    #buildHeader(): SafeHtml {
        return html`
            <div class="${
                'flex items-center'
                + ' justify-between mb-4'
            }">
                <h3 class="${
                    'font-display'
                    + ' font-semibold'
                    + ' flex items-center gap-2'
                }">Objectives</h3>
                <button
                    type="button"
                    data-action="add-objective"
                    class="btn btn-primary">
                    ${iconPlus(ICON_SIZE.base, '')} Add objective
                </button>
            </div>
        `;
    }

    #buildActiveList(): SafeHtml {
        if (this.#active.length === 0
            && this.#archived.length === 0) {
            return html`
                <p class="empty-state">
                    No objectives yet. Add one to get
                    started.
                </p>
            `;
        }
        return html`
            <ul class="objective-list"
                data-list="active">
                ${this.#active.map(
                    o => this.#row(o, false),
                )}
            </ul>
        `;
    }

    #buildArchivedList(): SafeHtml {
        if (this.#archived.length === 0) {
            return html``;
        }
        return html`
            <h4 class="objective-list-divider">
                Archived
            </h4>
            <ul class="objective-list">
                ${this.#archived.map(
                    o => this.#row(o, true),
                )}
            </ul>
        `;
    }

    #row(
        o: ObjectiveEntity,
        isArchived: boolean,
    ): SafeHtml {
        const def = this.#defs.get(o.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${
                    o.id}`,
            );
        }
        const date = this.#archivedAt.get(o.id);
        return html`
            <li class="objective-list-item"
                data-objective-id="${o.id}"
                data-position="${o.position}"
                data-archived="${isArchived}">
                ${!isArchived
                    ? html`<button
                        type="button"
                        class="drag-handle"
                        aria-label="${
                            'Reorder '
                            + def.name
                        }">
                        &#x22EE;&#x22EE;
                      </button>`
                    : html``}
                <div class="objective-text">
                    <strong>${def.name}</strong>
                    <span class="objective-desc">
                        ${def.description}
                    </span>
                    ${isArchived && date
                        ? html`<span class="meta">
                            Archived ${
                                formatDate(date)}
                          </span>`
                        : html``}
                </div>
                <div class="objective-actions">
                    ${isArchived
                        ? html`<button
                            class="${
                                'btn btn-ghost'
                                + ' btn-sm gap-2'
                            }"
                            data-action="reactivate">
                            ${iconUndo(ICON_SIZE.sm, '')}
                            Reactivate
                          </button>`
                        : html`
                            <button
                                class="${
                                    'btn btn-ghost'
                                    + ' btn-sm gap-2'
                                }"
                                data-action="edit">
                                ${iconEdit(ICON_SIZE.sm, '')}
                                Edit
                            </button>
                            <button
                                class="${
                                    'btn btn-ghost'
                                    + ' btn-sm gap-2'
                                }"
                                data-action="archive">
                                ${iconArchive(ICON_SIZE.sm, '')}
                                Archive
                            </button>
                        `}
                </div>
            </li>
        `;
    }
}
