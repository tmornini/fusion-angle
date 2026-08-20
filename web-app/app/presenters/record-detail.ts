import { html, trusted } from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconEdit,
    iconCheck,
    iconX,
    iconPlus,
    iconTrash,
} from '../icons.ts';
import type {
    AttributeType,
    Constraint,
} from '../../../api/types.ts';
import type {
    RecordAttribute,
    RecordModel,
    WorkOrder,
} from '../adapters/index.ts';
import {
    ATTRIBUTE_TYPES,
} from '../../../api/types.ts';
import {
    RECORD_STATE_CONFIG,
} from './state-display.ts';

// Projected instance field for the edit form. Unreadable
// attributes are omitted from the array entirely.
export type InstanceFieldAccess =
    | 'writable'
    | 'readonly';

export interface InstanceFieldView {
    readonly attributeId: string;
    readonly name: string;
    readonly value: string;
    readonly access: InstanceFieldAccess;
    readonly attributeType: AttributeType;
    readonly options: readonly string[];
}

export interface InstanceListItemView {
    readonly id: string;
    readonly fields: readonly {
        readonly name: string;
        readonly value: string;
    }[];
}

export interface InstanceEditView {
    readonly instanceId: string;
    readonly fields: readonly InstanceFieldView[];
    readonly conflictNotice: string | null;
}

export interface InstancesSectionView {
    readonly instances:
        readonly InstanceListItemView[];
    readonly editing: InstanceEditView | null;
}

// Client-side twin of attribute ACL evaluation (admin
// bypass + role intersect). Roles are plain bases
// (admin / member), already projected for the fenced org.
export interface InstanceAttributeAcl {
    readonly id: string;
    readonly name: string;
    readonly readRoles: readonly string[];
    readonly writeRoles: readonly string[];
    readonly attributeType: AttributeType;
    readonly options: readonly string[];
}

export const INSTANCE_CONFLICT_NOTICE =
    'This instance changed underneath you'
    + ' — values refreshed; re-apply your edit';

function rolesIntersect(
    held: readonly string[],
    allowed: readonly string[],
): boolean {
    return allowed.some(
        role => held.includes(role),
    );
}

export function projectInstanceFields(
    attributes: readonly InstanceAttributeAcl[],
    values: ReadonlyMap<string, string>,
    roles: readonly string[],
): InstanceFieldView[] {
    const isAdmin = roles.includes('admin');
    const out: InstanceFieldView[] = [];
    for (const attr of attributes) {
        const canRead = isAdmin
            || rolesIntersect(
                roles, attr.readRoles,
            );
        if (!canRead) continue;
        const canWrite = isAdmin
            || rolesIntersect(
                roles, attr.writeRoles,
            );
        out.push({
            attributeId: attr.id,
            name: attr.name,
            value: values.get(attr.id) ?? '',
            access: canWrite
                ? 'writable'
                : 'readonly',
            attributeType: attr.attributeType,
            options: attr.options,
        });
    }
    return out;
}

export function instanceListItems(
    instances: readonly {
        readonly id: string;
        readonly values: ReadonlyMap<
            string, string
        >;
    }[],
    attributes: readonly {
        readonly id: string;
        readonly name: string;
    }[],
): InstanceListItemView[] {
    const nameById = new Map(
        attributes.map(
            a => [a.id, a.name] as const,
        ),
    );
    return instances.map(inst => {
        const fields: {
            name: string;
            value: string;
        }[] = [];
        for (const [attrId, value] of
            inst.values
        ) {
            const name = nameById.get(attrId);
            if (name === undefined) continue;
            fields.push({ name, value });
        }
        return { id: inst.id, fields };
    });
}

export class RecordInstancesPresenter {
    readonly #view: InstancesSectionView;

    constructor(view: InstancesSectionView) {
        this.#view = view;
    }

    buildCard(): SafeHtml {
        return html`<div
            class="card mb-6 p-6"
            id="record-instances-section">
            <div class="${
                'flex items-center'
                + ' justify-between gap-4 mb-4'
            }">
                <h2 class="${
                    'text-lg font-semibold'
                }">Instances</h2>
                ${this.#view.editing === null
                    ? html`<button type="button"
                        id="record-new-instance-btn"
                        class="${
                            'btn btn-ghost btn-sm'
                        }">
                        ${iconPlus(
                            ICON_SIZE.sm, '',
                        )}
                        New instance
                    </button>`
                    : html``}
            </div>
            ${this.#view.editing !== null
                ? this.#buildEditForm(
                    this.#view.editing,
                )
                : this.#buildList()}
        </div>`;
    }

    #buildList(): SafeHtml {
        if (this.#view.instances.length === 0) {
            return html`<p class="text-muted"
                >No instances yet.</p>`;
        }
        return html`<ul
            class="record-instance-list">
            ${this.#view.instances.map(
                item => this.#buildListItem(item),
            )}
        </ul>`;
    }

    #buildListItem(
        item: InstanceListItemView,
    ): SafeHtml {
        const valueBits = item.fields.length === 0
            ? html`<span class="text-muted text-sm"
                >(empty)</span>`
            : item.fields.map(
                f => html`<span
                    class="record-instance-value">
                    <span class="${
                        'text-muted text-sm'
                    }">${f.name}:</span>
                    <span>${f.value}</span>
                </span>`,
            );
        return html`<li
            class="record-instance-row"
            data-instance-id="${item.id}">
            <div class="record-instance-meta">
                <code class="${
                    'record-instance-id text-sm'
                }">${item.id}</code>
                <div class="${
                    'record-instance-values'
                }">${valueBits}</div>
            </div>
            <div class="record-instance-actions">
                <button type="button"
                    class="btn btn-ghost btn-xs"
                    data-action="edit-instance"
                    data-instance-id="${
                        item.id
                    }">
                    ${iconEdit(ICON_SIZE.sm, '')}
                    Edit
                </button>
                <button type="button"
                    class="btn btn-ghost btn-xs"
                    data-dialog-open="${
                        'confirm-delete-instance'
                    }"
                    data-instance-id="${
                        item.id
                    }">
                    ${iconTrash(ICON_SIZE.sm, '')}
                    Delete
                </button>
            </div>
        </li>`;
    }

    #buildEditForm(
        edit: InstanceEditView,
    ): SafeHtml {
        return html`<div
            class="record-instance-edit"
            data-instance-id="${
                edit.instanceId
            }">
            <div class="${
                'flex items-center'
                + ' justify-between gap-4 mb-4'
            }">
                <code class="${
                    'record-instance-id text-sm'
                }">${edit.instanceId}</code>
                <div class="flex gap-2">
                    <button type="button"
                        id="${
                            'record-instance-'
                            + 'cancel-btn'
                        }"
                        class="${
                            'btn btn-ghost btn-sm'
                        }">
                        ${iconX(ICON_SIZE.sm, '')}
                        Cancel
                    </button>
                    <button type="button"
                        id="${
                            'record-instance-'
                            + 'save-btn'
                        }"
                        class="${
                            'btn btn-primary btn-sm'
                        }">
                        ${iconCheck(
                            ICON_SIZE.sm, '',
                        )}
                        Save
                    </button>
                </div>
            </div>
            ${edit.conflictNotice !== null
                ? html`<p class="${
                    'record-instance-conflict'
                    + ' mb-4 text-sm'
                }"
                    data-tone="warning"
                    role="status"
                    >${edit.conflictNotice}</p>`
                : html``}
            <div class="${
                'record-instance-field-list'
            }">
                ${edit.fields.map(
                    f => this.#buildEditField(f),
                )}
            </div>
        </div>`;
    }

    #buildEditField(
        f: InstanceFieldView,
    ): SafeHtml {
        if (f.access === 'writable') {
            const fieldId =
                'instance-field-' + f.attributeId;
            if (f.attributeType === 'select') {
                return html`<div
                    class="record-instance-field"
                    data-attribute-id="${
                        f.attributeId
                    }"
                    data-access="writable">
                    <label class="label"
                        for="${fieldId}"
                        >${f.name}</label>
                    <select
                        class="input input-sm"
                        id="${fieldId}"
                        data-action="${
                            'instance-field-value'
                        }"
                        data-attribute-id="${
                            f.attributeId
                        }">
                        <option value="">
                            Select...
                        </option>
                        ${f.options.map(
                            o => html`<option
                                value="${o}"
                                ${o === f.value
                                    ? trusted(
                                        'selected',
                                    )
                                    : html``}
                                >${o}</option>`,
                        )}
                    </select>
                </div>`;
            }
            if (f.attributeType === 'radio') {
                return html`<div
                    class="record-instance-field"
                    data-attribute-id="${
                        f.attributeId
                    }"
                    data-access="writable">
                    <span class="label"
                        >${f.name}</span>
                    <div class="radio-group">
                        ${f.options.map(
                            o => html`<label
                                class="radio-option">
                                <input
                                    type="radio"
                                    name="${
                                        fieldId
                                    }"
                                    value="${o}"
                                    data-action="${
                                        'instance-field-value'
                                    }"
                                    data-attribute-id="${
                                        f.attributeId
                                    }"
                                    ${o === f.value
                                        ? trusted(
                                            'checked',
                                        )
                                        : html``}
                                    />
                                <span>${o}</span>
                            </label>`,
                        )}
                    </div>
                </div>`;
            }
            return html`<div
                class="record-instance-field"
                data-attribute-id="${
                    f.attributeId
                }"
                data-access="writable">
                <label class="label"
                    for="${fieldId}"
                    >${f.name}</label>
                <input type="text"
                    id="${fieldId}"
                    class="input input-sm"
                    data-action="${
                        'instance-field-value'
                    }"
                    data-attribute-id="${
                        f.attributeId
                    }"
                    value="${f.value}" />
            </div>`;
        }
        return html`<div
            class="record-instance-field"
            data-attribute-id="${
                f.attributeId
            }"
            data-access="readonly">
            <span class="label"
                >${f.name}</span>
            <span class="${
                'record-instance-readonly'
                + ' text-sm'
            }">${
                f.value === ''
                    ? '—'
                    : f.value
            }</span>
        </div>`;
    }
}

export interface RecordDetailView {
    readonly record: RecordModel;
    readonly attributes:
        readonly RecordAttribute[];
    readonly boundFlows: readonly {
        id: string;
        name: string;
    }[];
    readonly workOrders:
        readonly WorkOrder[];
    readonly instances: InstancesSectionView;
}

export class RecordDetailPresenter {
    readonly #view: RecordDetailView;

    constructor(view: RecordDetailView) {
        this.#view = view;
    }

    buildPage(): SafeHtml {
        const state =
            this.#view.record.stateValue();
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
                        }"
                        aria-label="Back">
                        ${iconArrowLeft(ICON_SIZE.xl, '')}
                    </button>
                    <div>
                        <h1 class="${
                            'text-2xl'
                            + ' font-display'
                            + ' font-bold'
                        }">${
                            this.#view.record
                                .nameText()
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
                    ${iconEdit(ICON_SIZE.base, '')}
                    Edit
                </button>
            </div>
            <p class="text-muted mb-6"
                >${
                    this.#view.record
                        .descriptionText()
                }</p>
            ${this.#buildAttributesCard()}
            ${new RecordInstancesPresenter(
                this.#view.instances,
            ).buildCard()}
            ${this.#buildBoundFlowsCard()}
            ${this.#buildWorkOrdersCard()}
        </div>`;
    }

    #buildAttributesCard(): SafeHtml {
        const rows = [
            ...this.#view.attributes,
        ].toSorted(
            (a, b) =>
                a.sortOrder - b.sortOrder,
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
        a: RecordAttribute,
    ): SafeHtml {
        return html`<div
            class="record-attribute-row">
            <span class="font-medium"
                >${a.name}</span>
            <span class="${
                'badge badge-outline text-xs'
            }">${a.attributeType}</span>
            <span class="text-muted text-sm"
                >${
                    a.constraints
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
                        <button type="button"
                        class="${
                            'link record-flow-link'
                        }"
                        data-flow-id="${f.id}"
                            >${f.name}</button>
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
                        <button type="button"
                        class="${
                            'link record-wo-link'
                        }"
                        data-work-order-id="${
                            w.id
                        }"
                            >#${w.displayId}</button>
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
    attributeType: AttributeType;
    sortOrder: number;
    options: string[];
    constraints: Constraint[];
}

export function recordDraftFromView(
    view: {
        record: RecordModel;
        attributes:
            readonly RecordAttribute[];
    },
): RecordDetailDraft {
    return {
        name: view.record.nameText(),
        description:
            view.record.descriptionText(),
        attributes: view.attributes
            .toSorted(
                (a, b) =>
                    a.sortOrder - b.sortOrder,
            )
            .map(a => ({
                id: a.id,
                name: a.name,
                attributeType: a.attributeType,
                sortOrder: a.sortOrder,
                options: [...a.options],
                constraints: a.constraints.map(
                    c => ({ ...c }),
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
                        }"
                        aria-label="Cancel">
                        ${iconX(ICON_SIZE.xl, '')}
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
                    ${iconCheck(ICON_SIZE.base, '')}
                    Save
                </button>
            </div>
            <div class="mb-6">
                <label class="label"
                    for="record-edit-desc"
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
                            a.sortOrder
                            - b.sortOrder,
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
                    ${iconPlus(ICON_SIZE.sm, '')}
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
                                a.attributeType
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
                ${iconTrash(ICON_SIZE.sm, '')}
            </button>
        </div>`;
    }

    #buildOptionsField(
        a: AttributeDraft,
    ): SafeHtml {
        if (
            a.attributeType !== 'select'
            && a.attributeType !== 'radio'
        ) {
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
                a.attributeType,
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
                ${iconX(ICON_SIZE.xs, '')}
            </button>
        </div>`;
    }
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
