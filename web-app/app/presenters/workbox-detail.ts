import {
    html, trusted, escapeForHtml,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    memberName,
    type WorkOrder,
    type TransitionEvent,
    type StateFieldValue,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type RecordAttribute,
    type HistoryEntry,
    type HistoryFieldValue,
    type ClaimStatus,
    type ConstraintViolation,
} from '../adapters/index.ts';
import type { Member } from '../adapters/index.ts';
import type { Id } from '../../../api/types.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconClock,
} from '../icons.ts';
import {
    formatViolation,
} from '../../../api/record-constraints.ts';

const ATTRIBUTE_HTML_TYPE: Record<
    string,
    { type: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    checkbox: { type: 'checkbox' },
};

// Unbound action-screen prompt on disabled fields.
const UNBOUND_FIELD_TITLE =
    'Bind an instance before editing values';

export type WorkOrderBinding = {
    readonly instanceId: string;
    readonly recordTypeId: string;
};

export type InstancePickerItem = {
    readonly id: string;
    readonly fields: readonly {
        readonly name: string;
        readonly value: string;
    }[];
};

export function buildAttributeInputHtml(
    ref: NodeAttribute,
    attribute: RecordAttribute,
    value: string | null = null,
    forceDisabled = false,
): SafeHtml {
    const id = attribute.id;
    const isReadonly = ref.mode === 'readonly'
        || forceDisabled;
    const requiredAttr = ref.isRequired
        && !forceDisabled
        ? trusted('required')
        : html``;
    const readonlyAttr = isReadonly
        ? trusted('readonly')
        : html``;
    const disabledAttr = isReadonly
        ? trusted('disabled')
        : html``;
    const titleAttr = forceDisabled
        ? trusted(
            ' title="'
            + escapeForHtml(UNBOUND_FIELD_TITLE)
            + '"',
        )
        : html``;
    const safeValue = value ?? '';
    if (attribute.attributeType === 'select') {
        const options = attribute.options;
        return html`<select
            class="input"
            id="wo-attr-${id}"
            data-attribute-id="${id}"
            ${disabledAttr}
            ${requiredAttr}
            ${titleAttr}>
            <option value="">
                Select...
            </option>
            ${options.map(
                o => html`<option
                    value="${o}"
                    ${o === safeValue
                        ? trusted('selected')
                        : html``}
                    >${o}</option>`,
            )}
        </select>`;
    }
    if (attribute.attributeType === 'radio') {
        const options = attribute.options;
        return html`<div class="radio-group">
            ${options.map(
                o => html`<label
                    class="radio-option">
                    <input type="radio"
                        name="${id}"
                        value="${o}"
                        data-attribute-id="${id}"
                        ${o === safeValue
                            ? trusted('checked')
                            : html``}
                        ${disabledAttr}
                        ${requiredAttr}
                        ${titleAttr} />
                    <span>${o}</span>
                </label>`,
            )}
        </div>`;
    }
    const spec = ATTRIBUTE_HTML_TYPE[
        attribute.attributeType
    ];
    if (!spec) {
        throw new Error(
            'unknown attributeType: '
            + attribute.attributeType,
        );
    }
    if (spec.type === 'checkbox') {
        const checked = safeValue === 'true'
            ? trusted('checked')
            : html``;
        return html`<input
            type="checkbox"
            id="wo-attr-${id}"
            data-attribute-id="${id}"
            ${checked}
            ${disabledAttr}
            ${requiredAttr}
            ${titleAttr} />`;
    }
    return html`<input
        type="${spec.type}"
        class="input"
        id="wo-attr-${id}"
        data-attribute-id="${id}"
        value="${safeValue}"
        ${readonlyAttr}
        ${disabledAttr}
        ${requiredAttr}
        ${titleAttr} />`;
}

export class WorkboxDetailPresenter {
    readonly #workOrder: WorkOrder;
    readonly #flowGraph: WorkOrderFlowGraph;
    readonly #currentNode: GraphNode;
    readonly #outgoingEdges:
        readonly GraphEdge[];
    readonly #history:
        readonly HistoryEntry[];
    readonly #claim: ClaimStatus;
    readonly #attributeMap: ReadonlyMap<
        string, RecordAttribute
    >;
    readonly #instanceValues: ReadonlyMap<
        string, string
    > | null;
    readonly #binding: WorkOrderBinding | null;
    readonly #pickerItems:
        readonly InstancePickerItem[];
    readonly #conflictNotice: string | null;

    constructor(
        workOrder: WorkOrder,
        transitions:
            readonly TransitionEvent[],
        fieldValuesByEvent:
            ReadonlyMap<
                Id,
                readonly StateFieldValue[]
            >,
        activeClaim:
            { memberId: Id; at: string } | null,
        memberMap: Map<Id, Member>,
        currentMemberId: string,
        attributeMap: ReadonlyMap<
            string, RecordAttribute
        >,
        instanceValues:
            ReadonlyMap<string, string> | null,
        binding: WorkOrderBinding | null,
        pickerItems:
            readonly InstancePickerItem[] = [],
        conflictNotice: string | null = null,
    ) {
        this.#workOrder = workOrder;
        this.#flowGraph = workOrder.flowGraph;
        this.#attributeMap = attributeMap;
        this.#instanceValues = instanceValues;
        this.#binding = binding;
        this.#pickerItems = pickerItems;
        this.#conflictNotice = conflictNotice;

        const sorted = [...transitions]
            .sort(
                (a, b) =>
                    a.at
                        .localeCompare(b.at),
            );

        this.#currentNode = findCurrentNode(
            this.#flowGraph.nodes,
            sorted,
        );
        this.#outgoingEdges =
            this.#flowGraph.edges.filter(
                e => e.fromNodeId
                    === this.#currentNode.id,
            );
        this.#history = buildHistory(
            sorted,
            fieldValuesByEvent,
            this.#flowGraph.nodes,
            memberMap,
            attributeMap,
        );

        this.#claim = activeClaim
            ? {
                kind: 'claimed',
                at: activeClaim.at,
                byCurrentMember:
                    activeClaim.memberId
                        === currentMemberId,
            }
            : { kind: 'unclaimed' };
    }

    idValue(): string {
        return this.#workOrder.id;
    }

    flowNameText(): string {
        return this.#flowGraph.name;
    }

    displayIdText(): string {
        return this.#workOrder.displayId;
    }

    isArchive(): boolean {
        return this.#currentNode.isArchive;
    }

    currentNodeId(): string {
        return this.#currentNode.id;
    }

    renderableAttributes():
        readonly NodeAttribute[] {
        return this.#currentNode.attributes;
    }

    claimStatus(): ClaimStatus {
        return this.#claim;
    }

    binding(): WorkOrderBinding | null {
        return this.#binding;
    }

    isBound(): boolean {
        return this.#binding !== null;
    }

    // Banner for a rejected transition: one line per
    // constraint the Record gate failed, named by its
    // attribute. The violations carry their own data;
    // formatViolation phrases each by kind, date-aware
    // for range bounds.
    buildViolations(
        violations: readonly ConstraintViolation[],
    ): SafeHtml {
        return html`<div
            class="violations-banner"
            role="alert">
            <p class="violations-banner-title">
                This transition can't be saved yet:
            </p>
            <ul class="violations-banner-list">
                ${violations.map(
                    v => html`<li>${
                        formatViolation(
                            v,
                            this.#requireAttributeById(
                                v.attributeId,
                            ),
                        )
                    }</li>`,
                )}
            </ul>
        </div>`;
    }

    buildPage(): SafeHtml {
        const complete = this.isArchive();

        const fields = complete
            ? html``
            : this.#buildAttributesCard();

        const transitions = complete
            ? html``
            : this.#buildTransitionButtons();

        const violationsSlot = complete
            ? html``
            : html`<div
                id="transition-violations"></div>`;

        const unclaimBtn = complete
            ? html``
            : html`<button
                id="unclaim-btn"
                class="btn btn-outline">
                Release Work Order
            </button>`;

        const conflict = this.#conflictNotice
            !== null
            ? html`<p class="${
                'work-order-conflict mb-4'
                + ' text-sm'
            }"
                data-tone="warning"
                role="status"
                >${this.#conflictNotice}</p>`
            : html``;

        // Bind rides the header so the compositor
        // click lands in the 1280×800 viewport
        // (WB11). Attributes are two columns so
        // submit stays below them and still in view.
        return html`<div
            class="entity">
            <div id="work-order-header"
                class="flex items-center
                    gap-4 mb-6">
                <button
                    id="work-order-back-btn"
                    class="btn btn-ghost
                        btn-icon"
                    aria-label="Back">
                    ${iconArrowLeft(ICON_SIZE.xl, '')}
                </button>
                <div class="flex-1">
                    <h1 class="text-2xl
                        font-bold mb-1">
                        ${this.flowNameText()}
                    </h1>
                    <div class="flex
                        items-center gap-3
                        flex-wrap">
                        <span
                            class="badge
                                badge-neutral">
                            #${this
                                .displayIdText()}
                        </span>
                        <span
                            class="badge
                                badge-info"${this
                                .#currentNodeTitleAttr()}>
                            ${this
                                .#currentNodeName()}
                        </span>
                        ${this.#bindingBadge()}
                    </div>
                </div>
                ${this.#bindButton()}
            </div>

            ${conflict}
            ${fields}
            ${violationsSlot}
            ${transitions}

            <div class="flex gap-3 mb-6
                flex-wrap">
                ${unclaimBtn}
            </div>

            <details
                id="work-order-history"
                open>
                <summary
                    class="text-lg
                        font-semibold mb-3
                        cursor-pointer">
                    History
                </summary>
                <div class="card p-4">
                    ${!this.#hasHistory()
                        ? html`<p
                            class="text-muted">
                            No history yet.
                        </p>`
                        : this.#historyEntries()
                            .toReversed()
                            .map(
                                e =>
                                    this
                                    .#buildHistoryEntry(
                                        e,
                                    ),
                            )}
                </div>
            </details>
            ${this.#bindDialog()}
        </div>`;
    }

    #bindingBadge(): SafeHtml {
        const bind = this.#binding;
        if (bind === null) {
            return html`<span
                class="badge badge-warning"
                data-binding="unbound">
                Unbound
            </span>`;
        }
        return html`<span
            class="badge badge-success"
            data-binding="bound"
            title="${
                'type ' + bind.recordTypeId
            }">
            Instance ${bind.instanceId}
        </span>`;
    }

    #bindButton(): SafeHtml {
        if (
            this.isArchive()
            || this.#binding !== null
        ) {
            return html``;
        }
        return html`<button
            type="button"
            class="btn btn-primary"
            data-dialog-open="bind-instance">
            Bind instance
        </button>`;
    }

    #bindDialog(): SafeHtml {
        if (
            this.isArchive()
            || this.#binding !== null
        ) {
            return html``;
        }
        const rows = this.#pickerItems.length === 0
            ? html`<p class="text-muted">
                No instances available.
            </p>`
            : html`<ul class="${
                'bind-instance-list'
            }">
                ${this.#pickerItems.map(
                    item => this.#pickerRow(item),
                )}
            </ul>`;
        return html`<dialog
            id="bind-instance-dialog"
            class="dialog dialog-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="${
                'bind-instance-title'
            }">
            <div class="dialog-header">
                <h3 class="dialog-title"
                    id="bind-instance-title">
                    Bind instance
                </h3>
                <p class="dialog-description">
                    Choose an instance of the
                    flow's record type for this
                    work order.
                </p>
            </div>
            <div class="py-4">
                ${rows}
            </div>
            <div class="dialog-footer">
                <button
                    type="button"
                    class="btn btn-outline"
                    data-dialog-cancel="${
                        'bind-instance'
                    }">
                    Cancel
                </button>
            </div>
        </dialog>`;
    }

    #pickerRow(
        item: InstancePickerItem,
    ): SafeHtml {
        const summary = item.fields.length === 0
            ? html`<span class="text-muted">
                (empty)
            </span>`
            : item.fields.map(
                f => html`<span
                    class="bind-instance-field">
                    <span class="text-muted"
                        >${f.name}</span>
                    <span>${f.value}</span>
                </span>`,
            );
        // data-instance-pick — NEVER data-attribute-id
        // (collectAttributeValues scrapes the latter).
        return html`<li>
            <button
                type="button"
                class="${
                    'btn btn-outline'
                    + ' bind-instance-pick'
                }"
                data-instance-pick="${item.id}">
                <span class="font-semibold"
                    >${item.id}</span>
                <span class="${
                    'bind-instance-summary'
                }">
                    ${summary}
                </span>
            </button>
        </li>`;
    }

    #buildAttributesCard(): SafeHtml {
        const refs = this.renderableAttributes();
        const resolved = refs
            .map(ref => ({
                ref,
                attribute:
                    this.#requireAttribute(ref),
            }))
            .toSorted(
                (a, b) =>
                    a.attribute.sortOrder
                    - b.attribute.sortOrder,
            );
        return html`<div
            id="work-order-fields"
            class="card mb-6 p-6">
            <h3 class="text-lg
                font-semibold mb-4">
                Attributes
            </h3>
            <div class="work-order-attr-grid">
                ${resolved.map(
                    r => this.#buildAttributeRow(
                        r.ref, r.attribute,
                    ),
                )}
            </div>
        </div>`;
    }

    #requireAttribute(
        ref: NodeAttribute,
    ): RecordAttribute {
        return this.#requireAttributeById(
            ref.attributeId,
        );
    }

    #requireAttributeById(
        attributeId: string,
    ): RecordAttribute {
        const attribute = this.#attributeMap.get(
            attributeId,
        );
        if (!attribute) {
            throw new Error(
                'attribute reference points to'
                + ' unknown attributeId: '
                + attributeId,
            );
        }
        return attribute;
    }

    #buildTransitionButtons(): SafeHtml {
        return html`<div
            id="work-order-transitions"
            class="flex gap-3 mb-6
                flex-wrap">
            ${this.#outgoingEdges.map(
                e => html`<button
                    class="btn btn-primary"
                    data-edge-id="${e.id}">
                    ${e.name}
                </button>`,
            )}
        </div>`;
    }

    #buildHistoryEntry(
        entry: HistoryEntry,
    ): SafeHtml {
        const hasValues =
            entry.fieldValues.length > 0;
        const valuesHtml = hasValues
            ? html`<div
                class="mt-2 ml-6
                    work-order-history-fields">
                ${entry.fieldValues.map(
                    fv => html`
                    <span
                        class="text-muted"
                    >${fv.fieldName}</span>
                    <span>${fv.value}</span>`,
                )}
            </div>`
            : html``;
        return html`<div
            class="py-3 border-b">
            <div
                class="flex items-center
                    gap-3"
            >
                <span class="text-muted">
                    ${iconClock(ICON_SIZE.sm, '')}
                </span>
                <span
                    class="font-semibold"
                >${entry.fromNodeName}
                    &rarr;
                    ${entry.toNodeName}</span>
                <span
                    class="text-muted
                        ml-auto"
                >${entry.memberName}</span>
                <span
                    class="text-muted
                        text-sm"
                >${this.#relativeTime(
                    entry.transitionedAt,
                )}</span>
            </div>
            ${valuesHtml}
        </div>`;
    }

    #buildAttributeRow(
        ref: NodeAttribute,
        attribute: RecordAttribute,
    ): SafeHtml {
        const label = attribute.name
            + (ref.isRequired ? ' *' : '');
        const headValue =
            this.#instanceValues?.get(
                attribute.id,
            ) ?? null;
        const forceDisabled =
            this.#binding === null;
        if (
            attribute.attributeType === 'radio'
        ) {
            return html`<fieldset class="${
                'attribute-group-fieldset'
            }">
                <legend
                    class="label"
                    >${label}</legend>
                ${buildAttributeInputHtml(
                    ref,
                    attribute,
                    headValue,
                    forceDisabled,
                )}
            </fieldset>`;
        }
        return html`<div>
            <label
                class="label"
                for="wo-attr-${attribute.id}"
                >${label}</label>
            ${buildAttributeInputHtml(
                ref,
                attribute,
                headValue,
                forceDisabled,
            )}
        </div>`;
    }

    #relativeTime(iso: string): string {
        const ms = Date.now()
            - new Date(iso).getTime();
        const sec = Math.floor(ms / 1000);
        const min = Math.floor(sec / 60);
        const hr = Math.floor(min / 60);
        const d = Math.floor(hr / 24);
        if (d > 0) return `${d}d ago`;
        if (hr > 0) return `${hr}h ago`;
        if (min > 0) return `${min}m ago`;
        return 'just now';
    }

    #currentNodeName(): string {
        return this.#currentNode.name;
    }

    #currentNodeTitleAttr(): SafeHtml {
        const text = this.#currentNode
            .taskInstructions;
        return text
            ? trusted(' title="'
                + escapeForHtml(text)
                + '"')
            : trusted('');
    }

    #hasHistory(): boolean {
        return this.#history.length > 0;
    }

    #historyEntries():
        readonly HistoryEntry[] {
        return this.#history;
    }
}

function findCurrentNode(
    nodes: readonly GraphNode[],
    sortedTransitions:
        readonly TransitionEvent[],
): GraphNode {
    const lastTransition =
        sortedTransitions.at(-1);
    if (!lastTransition) {
        throw new Error(
            'invariant violated: work'
            + ' order has no transitions',
        );
    }
    const lastToId = lastTransition.toNodeId;
    const node = nodes.find(
        n => n.id === lastToId,
    );
    if (!node) {
        throw new Error(
            'invariant violated:'
            + ' transition references'
            + ' unknown node ' + lastToId,
        );
    }
    return node;
}

function nodeNameById(
    nodes: readonly GraphNode[],
    nodeId: string,
): string {
    const node = nodes.find(
        n => n.id === nodeId,
    );
    if (!node) {
        throw new Error(
            'Node not found: ' + nodeId,
        );
    }
    return node.name;
}

function buildHistory(
    sortedTransitions:
        readonly TransitionEvent[],
    fieldValuesByEvent:
        ReadonlyMap<
            Id,
            readonly StateFieldValue[]
        >,
    nodes: readonly GraphNode[],
    memberMap: Map<Id, Member>,
    attributeMap: ReadonlyMap<
        string, RecordAttribute
    >,
): HistoryEntry[] {
    return sortedTransitions.map(t => {
        const rows =
            fieldValuesByEvent.get(t.id) ?? [];
        const fieldValues:
            HistoryFieldValue[] = [];
        for (const row of rows) {
            const attribute = attributeMap.get(
                row.attributeId,
            );
            if (!attribute) {
                throw new Error(
                    'Attribute not found: '
                        + row.attributeId,
                );
            }
            fieldValues.push({
                fieldName: attribute.name,
                value: row.value,
            });
        }
        return {
            fromNodeName:
                t.kind === 'creation'
                    ? 'Created'
                    : nodeNameById(
                        nodes,
                        t.fromNodeId,
                    ),
            toNodeName: nodeNameById(
                nodes, t.toNodeId,
            ),
            memberName: memberName(
                memberMap, t.memberId,
            ),
            transitionedAt:
                t.at,
            fieldValues,
        };
    });
}
