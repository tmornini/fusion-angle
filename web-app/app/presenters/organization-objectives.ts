import { html, type SafeHtml } from '../safe-html.ts';
import type {
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import { iconEdit, iconTrash, iconPlus }
    from '../icons.ts';
import { formatDate } from '../format.ts';

interface Definition {
    name: string;
    description: string;
}

export class OrganizationObjectivesPresenter {
    readonly #active: Objective[];
    readonly #deprecated: Objective[];
    readonly #defs: Map<ObjectiveId, Definition>;
    readonly #deprecatedAt: Map<ObjectiveId, string>;

    constructor(
        active: Objective[],
        deprecated: Objective[],
        defs: Map<ObjectiveId, Definition>,
        deprecatedAt: Map<ObjectiveId, string>,
    ) {
        this.#active = active;
        this.#deprecated = deprecated;
        this.#defs = defs;
        this.#deprecatedAt = deprecatedAt;
    }

    buildBox(): SafeHtml {
        return html`
            <section class="org-objectives-box">
                ${this.#buildHeader()}
                ${this.#buildActiveList()}
                ${this.#buildDeprecatedList()}
            </section>
        `;
    }

    #buildHeader(): SafeHtml {
        return html`
            <header class="org-objectives-header">
                <h3>Objectives</h3>
                <button
                    type="button"
                    data-action="add-objective"
                    class="btn btn-primary">
                    ${iconPlus(16, '')} Add objective
                </button>
            </header>
        `;
    }

    #buildActiveList(): SafeHtml {
        if (this.#active.length === 0
            && this.#deprecated.length === 0) {
            return html`
                <p class="empty-state">
                    No objectives yet. Add one to get
                    started.
                </p>
            `;
        }
        return html`
            <ul class="objective-list">
                ${this.#active.map(
                    o => this.#row(o, false),
                )}
            </ul>
        `;
    }

    #buildDeprecatedList(): SafeHtml {
        if (this.#deprecated.length === 0) {
            return html``;
        }
        return html`
            <h4 class="objective-list-divider">
                Deprecated
            </h4>
            <ul class="objective-list">
                ${this.#deprecated.map(
                    o => this.#row(o, true),
                )}
            </ul>
        `;
    }

    #row(
        o: Objective,
        isDeprecated: boolean,
    ): SafeHtml {
        const def = this.#defs.get(o.id);
        if (!def) {
            throw new Error(
                `objective definition missing for ${
                    o.id}`,
            );
        }
        const date = this.#deprecatedAt.get(o.id);
        return html`
            <li class="objective-list-item"
                data-objective-id="${o.id}"
                data-deprecated="${isDeprecated}">
                <span class="drag-handle"
                    aria-label="Drag to reorder">
                    &#x22EE;&#x22EE;
                </span>
                <div class="objective-text">
                    <strong>${def.name}</strong>
                    <span class="objective-desc">
                        ${def.description}
                    </span>
                    ${isDeprecated && date
                        ? html`<span class="meta">
                            Deprecated ${
                                formatDate(date)}
                          </span>`
                        : html``}
                </div>
                <div class="objective-actions">
                    ${isDeprecated
                        ? html`<button
                            data-action="reactivate"
                            data-objective-id="${
                                o.id}">
                            Reactivate
                          </button>`
                        : html`
                            <button
                                data-action="edit"
                                data-objective-id="${
                                    o.id}">
                                ${iconEdit(14, '')}
                                Edit
                            </button>
                            <button
                                data-action="deprecate"
                                data-objective-id="${
                                    o.id}">
                                ${iconTrash(14, '')}
                                Deprecate
                            </button>
                        `}
                </div>
            </li>
        `;
    }
}
