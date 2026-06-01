import { html, trusted } from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    iconArrowLeft,
    iconEdit,
    iconCheck,
    iconX,
    iconPlus,
    iconTrash,
} from '../icons.ts';
import type {
    RecordEntity,
    RecordAttributeEntity,
    RecordState,
    WorkOrderEntity,
    AttributeType,
    Constraint,
} from '../../../api/types.ts';
import {
    ATTRIBUTE_TYPES,
    RECORD_STATE_CONFIG,
} from '../../../api/types.ts';

export interface RecordDetailView {
    readonly record: RecordEntity;
    readonly state: RecordState;
    readonly attributes:
        readonly RecordAttributeEntity[];
    readonly boundFlows: readonly {
        id: string;
        name: string;
    }[];
    readonly workOrders:
        readonly WorkOrderEntity[];
}

export class RecordDetailPresenter {
    readonly #view: RecordDetailView;

    constructor(view: RecordDetailView) {
        this.#view = view;
    }

    buildPage(): SafeHtml {
        const state = this.#view.state;
        const cfg = RECORD_STATE_CONFIG[state];
        return html`<div class="entity">
            <div class="${
                'flex items-start'
                + ' justify-between gap-4 mb-6'
            }">
                <div class="${
                    'flex items-center gap-4'
                }">
                    <button
                        id="record-back-btn"
                        class="${
                            'btn btn-ghost'
                            + ' btn-icon'
                        }">
                        ${iconArrowLeft(20, '')}
                    </button>
                    <div>
                        <h1 class="${
                            'text-2xl'
                            + ' font-display'
                            + ' font-bold'
                        }">${
                            this.#view.record.name
                        }</h1>
                        <span class="${
                            'badge '
                        }${
                            cfg.className
                        }">${cfg.label}</span>
                    </div>
                </div>
                <button
                    id="record-edit-btn"
                    class="btn btn-primary">
                    ${iconEdit(16, '')}
                    Edit
                </button>
            </div>
            <p class="text-muted mb-6"
                >${
                    this.#view.record.description
                }</p>
            ${this.#buildAttributesCard()}
            ${this.#buildBoundFlowsCard()}
            ${this.#buildWorkOrdersCard()}
        </div>`;
    }

    #buildAttributesCard(): SafeHtml {
        const rows = [
            ...this.#view.attributes,
        ].toSorted(
            (a, b) =>
                a.sort_order - b.sort_order,
        );
        return html`<div class="card mb-6 p-6">
            <h2 class="${
                'text-lg font-semibold mb-4'
            }">Attributes</h2>
            ${rows.length === 0
                ? html`<p class="text-muted"
                    >No attributes yet.</p>`
                : rows.map(
                    a => this.#buildAttributeRow(a),
                )}
        </div>`;
    }

    #buildAttributeRow(
        a: RecordAttributeEntity,
    ): SafeHtml {
        const constraints =
            parseConstraints(a.constraints);
        return html`<div
            class="record-attribute-row">
            <span class="font-medium"
                >${a.name}</span>
            <span class="${
                'badge badge-outline text-xs'
            }">${a.attribute_type}</span>
            <span class="text-muted text-sm"
                >${
                    constraints
                        .map(formatConstraint)
                        .join(' · ')
                }</span>
        </div>`;
    }

    #buildBoundFlowsCard(): SafeHtml {
        return html`<div class="card mb-6 p-6">
            <h2 class="${
                'text-lg font-semibold mb-4'
            }">Bound flows</h2>
            ${this.#view.boundFlows.length === 0
                ? html`<p class="text-muted"
                    >No flows are bound to
                    this Record.</p>`
                : html`<ul
                    class="record-bound-flows">
                ${this.#view.boundFlows.map(
                    f => html`<li>
                        <a class="${
                            'link record-flow-link'
                        }"
                        data-flow-id="${f.id}"
                        href="javascript:void(0)"
                            >${f.name}</a>
                    </li>`,
                )}
                </ul>`}
        </div>`;
    }

    #buildWorkOrdersCard(): SafeHtml {
        return html`<div class="card mb-6 p-6">
            <h2 class="${
                'text-lg font-semibold mb-4'
            }">Work orders using this Record</h2>
            ${this.#view.workOrders.length === 0
                ? html`<p class="text-muted"
                    >No work orders yet.</p>`
                : html`<ul
                    class="record-work-orders">
                ${this.#view.workOrders.map(
                    w => html`<li>
                        <a class="${
                            'link record-wo-link'
                        }"
                        data-work-order-id="${
                            w.id
                        }"
                        href="javascript:void(0)"
                            >#${w.display_id}</a>
                    </li>`,
                )}
                </ul>`}
        </div>`;
    }
}

export interface RecordDetailDraft {
    name: string;
    description: string;
    attributes: AttributeDraft[];
}

export interface AttributeDraft {
    id: string;
    name: string;
    attribute_type: AttributeType;
    sort_order: number;
    options: string[];
    constraints: Constraint[];
}

export function recordDraftFromView(
    view: {
        record: RecordEntity;
        attributes:
            readonly RecordAttributeEntity[];
    },
): RecordDetailDraft {
    return {
        name: view.record.name,
        description: view.record.description,
        attributes: view.attributes
            .toSorted(
                (a, b) =>
                    a.sort_order - b.sort_order,
            )
            .map(a => ({
                id: a.id,
                name: a.name,
                attribute_type: a.attribute_type,
                sort_order: a.sort_order,
                options: parseOptions(
                    a.options,
                ),
                constraints: parseConstraints(
                    a.constraints,
                ),
            })),
    };
}

export class RecordDetailEditPresenter {
    readonly #draft: RecordDetailDraft;
    readonly #pendingAttributeName: string;

    constructor(
        draft: RecordDetailDraft,
        pendingAttributeName: string,
    ) {
        this.#draft = draft;
        this.#pendingAttributeName =
            pendingAttributeName;
    }

    buildPage(): SafeHtml {
        return html`<div class="entity">
            <div class="${
                'flex items-start'
                + ' justify-between gap-4 mb-6'
            }">
                <div class="${
                    'flex items-center gap-4'
                    + ' flex-1'
                }">
                    <button
                        id="record-cancel-btn"
                        class="${
                            'btn btn-ghost'
                            + ' btn-icon'
                        }">
                        ${iconX(20, '')}
                    </button>
                    <input
                        id="record-edit-name"
                        class="input"
                        value="${
                            this.#draft.name
                        }" />
                </div>
                <button
                    id="record-save-btn"
                    class="btn btn-primary">
                    ${iconCheck(16, '')}
                    Save
                </button>
            </div>
            <div class="mb-6">
                <label class="label"
                    >Description</label>
                <textarea
                    id="record-edit-desc"
                    class="input"
                    rows="3"
                    >${
                        this.#draft.description
                    }</textarea>
            </div>
            ${this.#buildAttributeEditor()}
        </div>`;
    }

    #buildAttributeEditor(): SafeHtml {
        return html`<div class="card mb-6 p-6">
            <h2 class="${
                'text-lg font-semibold mb-4'
            }">Attributes</h2>
            <div id="record-attribute-list">
                ${this.#draft.attributes
                    .toSorted(
                        (a, b) =>
                            a.sort_order
                            - b.sort_order,
                    )
                    .map(
                        a => this
                            .#buildAttributeRow(
                                a,
                            ),
                    )}
            </div>
            <div class="${
                'record-attribute-pending-row'
                + ' mt-2'
            }">
                <input type="text"
                    id="${
                        'record-pending-'
                        + 'attribute-name'
                    }"
                    class="input input-sm"
                    placeholder="Attribute name"
                    value="${
                        this.#pendingAttributeName
                    }" />
                <button
                    id="record-add-attribute-btn"
                    class="${
                        'btn btn-ghost btn-sm'
                    }">
                    ${iconPlus(14, '')}
                    Add Attribute
                </button>
            </div>
        </div>`;
    }

    #buildAttributeRow(
        a: AttributeDraft,
    ): SafeHtml {
        return html`<div
            class="record-attribute-edit-row"
            data-attribute-id="${a.id}">
            <input type="text"
                class="input input-sm"
                data-action="attribute-name"
                value="${a.name}"
                placeholder="Attribute name" />
            <select class="input input-sm"
                data-action="attribute-type">
                ${ATTRIBUTE_TYPES.map(
                    t => html`<option
                        value="${t}"${
                            trusted(
                                a.attribute_type
                                    === t
                                    ? ' selected'
                                    : '',
                            )
                        }>${t}</option>`,
                )}
            </select>
            ${this.#buildOptionsField(a)}
            ${this.#buildConstraintEditor(a)}
            <button
                class="btn btn-ghost btn-xs"
                data-action="remove-attribute">
                ${iconTrash(14, '')}
            </button>
        </div>`;
    }

    #buildOptionsField(
        a: AttributeDraft,
    ): SafeHtml {
        if (a.attribute_type !== 'select') {
            return html``;
        }
        return html`<textarea
            class="input input-sm"
            data-action="attribute-options"
            rows="2"
            placeholder="Options (one per line)"
        >${a.options.join('\n')}</textarea>`;
    }

    #buildConstraintEditor(
        a: AttributeDraft,
    ): SafeHtml {
        const allowed =
            allowedConstraintKinds(
                a.attribute_type,
            );
        const constraintRows = a.constraints.map(
            (c, i) => this.#buildConstraintRow(
                c, i,
            ),
        );
        return html`<div
            class="record-constraint-list">
            ${constraintRows}
            ${allowed.length > 0
                ? html`<div
                    class="${
                        'record-constraint-add'
                    }">
                <select class="input input-sm"
                    data-action="constraint-kind">
                <option value=""
                    >+ Add Constraint…</option>
                ${allowed.map(
                    k => html`<option
                        value="${k}"
                        >${k}</option>`,
                )}
                </select>
                </div>`
                : html``}
        </div>`;
    }

    #buildConstraintRow(
        c: Constraint,
        i: number,
    ): SafeHtml {
        const valueAttr = c.kind === 'regex'
            ? c.pattern
            : c.kind === 'range_min'
                ? c.min : c.max;
        return html`<div
            class="record-constraint-row"
            data-constraint-index="${
                String(i)
            }">
            <span class="text-xs"
                >${c.kind}</span>
            <input type="text"
                class="input input-sm"
                data-action="constraint-value"
                value="${valueAttr}" />
            <button
                class="btn btn-ghost btn-xs"
                data-action="remove-constraint">
                ${iconX(12, '')}
            </button>
        </div>`;
    }
}

function parseConstraints(
    raw: string,
): Constraint[] {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Constraint[];
}

function parseOptions(raw: string): string[] {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as string[];
}

export function allowedConstraintKinds(
    t: AttributeType,
): Constraint['kind'][] {
    if (t === 'text') return ['regex'];
    if (t === 'number' || t === 'date') {
        return ['range_min', 'range_max'];
    }
    return [];
}

export function formatConstraint(
    c: Constraint,
): string {
    if (c.kind === 'regex') {
        return 'matches ' + c.pattern;
    }
    if (c.kind === 'range_min') {
        return 'min ' + c.min;
    }
    return 'max ' + c.max;
}
