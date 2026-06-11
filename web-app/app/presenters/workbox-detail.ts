import {
    html, trusted, escapeForHtml,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    memberName,
    validateWorkOrderFlowGraph,
    type WorkOrderEntity,
    type TransitionEvent,
    type StateFieldValueEntity,
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
    iconArrowLeft,
    iconClock,
} from '../icons.ts';
import {
    formatViolation,
} from '../record-constraints.ts';

const ATTRIBUTE_HTML_TYPE: Record<
    string,
    { type: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    checkbox: { type: 'checkbox' },
};

export function buildAttributeInputHtml(
    ref: NodeAttribute,
    attribute: RecordAttribute,
): SafeHtml {
    const id = attribute.id;
    const isReadonly = ref.mode === 'readonly';
    const requiredAttr = ref.isRequired
        ? trusted('required')
        : html``;
    const readonlyAttr = isReadonly
        ? trusted('readonly')
        : html``;
    const disabledAttr = isReadonly
        ? trusted('disabled')
        : html``;
    if (attribute.attribute_type === 'select') {
        const options = attribute.options;
        return html`<select
            class="input"
            data-attribute-id="${id}"
            ${disabledAttr}
            ${requiredAttr}>
            <option value="">
                Select...
            </option>
            ${options.map(
                o => html`<option
                    value="${o}"
                    >${o}</option>`,
            )}
        </select>`;
    }
    if (attribute.attribute_type === 'radio') {
        const options = attribute.options;
        return html`<div class="radio-group">
            ${options.map(
                o => html`<label
                    class="radio-option">
                    <input type="radio"
                        name="${id}"
                        value="${o}"
                        data-attribute-id="${id}"
                        ${disabledAttr}
                        ${requiredAttr} />
                    <span>${o}</span>
                </label>`,
            )}
        </div>`;
    }
    const spec = ATTRIBUTE_HTML_TYPE[
        attribute.attribute_type
    ];
    if (!spec) {
        throw new Error(
            'unknown attribute_type: '
            + attribute.attribute_type,
        );
    }
    if (spec.type === 'checkbox') {
        return html`<input
            type="checkbox"
            data-attribute-id="${id}"
            ${disabledAttr}
            ${requiredAttr} />`;
    }
    return html`<input
        type="${spec.type}"
        class="input"
        data-attribute-id="${id}"
        ${readonlyAttr}
        ${requiredAttr} />`;
}

export class WorkboxDetailPresenter {
    readonly #workOrder: WorkOrderEntity;
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

    constructor(
        workOrder: WorkOrderEntity,
        transitions:
            readonly TransitionEvent[],
        fieldValuesByEvent:
            ReadonlyMap<
                Id,
                readonly StateFieldValueEntity[]
            >,
        activeClaim:
            { memberId: Id; at: string } | null,
        memberMap: Map<Id, Member>,
        currentMemberId: string,
        attributeMap: ReadonlyMap<
            string, RecordAttribute
        >,
    ) {
        this.#workOrder = workOrder;
        this.#flowGraph =
            validateWorkOrderFlowGraph(
                workOrder.flow_graph,
            );
        this.#attributeMap = attributeMap;

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
        return this.#workOrder.display_id;
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

        return html`<div
            class="entity">
            <div id="work-order-header"
                class="flex items-center
                    gap-4 mb-6">
                <button
                    id="work-order-back-btn"
                    class="btn btn-ghost
                        btn-icon">
                    ${iconArrowLeft(20, '')}
                </button>
                <div>
                    <h1 class="text-2xl
                        font-bold mb-1">
                        ${this.flowNameText()}
                    </h1>
                    <div class="flex
                        items-center gap-3">
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
                    </div>
                </div>
            </div>

            ${fields}
            ${violationsSlot}
            ${transitions}

            <div class="flex gap-3 mb-6">
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
        </div>`;
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
                    a.attribute.sort_order
                    - b.attribute.sort_order,
            );
        return html`<div
            id="work-order-fields"
            class="card mb-6 p-6">
            <h3 class="text-lg
                font-semibold mb-4">
                Attributes
            </h3>
            ${resolved.map(
                r => this.#buildAttributeRow(
                    r.ref, r.attribute,
                ),
            )}
        </div>`;
    }

    #requireAttribute(
        ref: NodeAttribute,
    ): RecordAttribute {
        return this.#requireAttributeById(
            ref.attribute_id,
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
                + ' unknown attribute_id: '
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
                    ${iconClock(14, '')}
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
        return html`<div class="mb-4">
            <label
                class="label">${label}</label>
            ${buildAttributeInputHtml(
                ref, attribute,
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
    const lastToId = lastTransition.to_node_id;
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
            readonly StateFieldValueEntity[]
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
                row.field_id,
            );
            if (!attribute) {
                throw new Error(
                    'Attribute not found: '
                        + row.field_id,
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
                        t.from_node_id,
                    ),
            toNodeName: nodeNameById(
                nodes, t.to_node_id,
            ),
            memberName: memberName(
                memberMap, t.member_id,
            ),
            transitionedAt:
                t.at,
            fieldValues,
        };
    });
}
