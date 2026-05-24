import {
    html, trusted,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    workerName,
    validateWorkOrderFlowGraph,
    type WorkOrderEntity,
    type TransitionEvent,
    type StateFieldValueEntity,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
    type RecordAttributeEntity,
    type HistoryEntry,
    type HistoryFieldValue,
    type ClaimStatus,
} from '../adapters/index.ts';
import type { Worker } from '../adapters/index.ts';
import type { Id } from '../../../api/types.ts';
import {
    iconArrowLeft,
    iconClock,
} from '../icons.ts';

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
    attribute: RecordAttributeEntity,
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
        const options = JSON.parse(
            attribute.options,
        ) as string[];
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
        string, RecordAttributeEntity
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
            { workerId: Id; at: string } | null,
        workerMap: Map<Id, Worker>,
        currentWorkerId: string,
        attributeMap: ReadonlyMap<
            string, RecordAttributeEntity
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
            workerMap,
            attributeMap,
        );

        this.#claim = activeClaim
            ? {
                kind: 'claimed',
                at: activeClaim.at,
                byCurrentWorker:
                    activeClaim.workerId
                        === currentWorkerId,
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

    buildPage(): SafeHtml {
        const complete = this.isArchive();

        const fields = complete
            ? html``
            : this.#buildAttributesCard();

        const transitions = complete
            ? html``
            : this.#buildTransitionButtons();

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
                                badge-info">
                            ${this
                                .#currentNodeName()}
                        </span>
                    </div>
                </div>
            </div>

            ${fields}
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
    ): RecordAttributeEntity {
        const attribute = this.#attributeMap.get(
            ref.attribute_id,
        );
        if (!attribute) {
            throw new Error(
                'node attribute references'
                + ' unknown attribute_id: '
                + ref.attribute_id,
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
                >${entry.workerName}</span>
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
        attribute: RecordAttributeEntity,
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
    workerMap: Map<Id, Worker>,
    attributeMap: ReadonlyMap<
        string, RecordAttributeEntity
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
                t.from_node_id === ''
                    ? 'Created'
                    : nodeNameById(
                        nodes,
                        t.from_node_id,
                    ),
            toNodeName: nodeNameById(
                nodes, t.to_node_id,
            ),
            workerName: workerName(
                workerMap, t.worker_id,
            ),
            transitionedAt:
                t.at,
            fieldValues,
        };
    });
}
