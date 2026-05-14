import {
    html, trusted,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    workerName,
    validateWorkOrderFlowGraph,
    isExpiredClaim,
    type WorkOrderEntity,
    type WorkOrderTransitionEntity,
    type TransitionFieldValueEntity,
    type WorkOrderClaimEntity,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type GraphField,
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

const FIELD_HTML_TYPE: Record<
    string,
    { type: string; extra?: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    email: { type: 'email' },
    url: { type: 'url' },
    phone: { type: 'tel' },
    currency: {
        type: 'number',
        extra: 'step="0.01"',
    },
    checkbox: { type: 'checkbox' },
    file: { type: 'file' },
    image: {
        type: 'file',
        extra: 'accept="image/*"',
    },
};

export function buildFieldInputHtml(
    field: GraphField,
): SafeHtml {
    const id = field.id;
    const requiredAttr = field.isRequired
        ? trusted('required')
        : html``;
    if (field.fieldType === 'textarea') {
        return html`<textarea
            class="input"
            rows="3"
            data-field-id="${id}"
            ${requiredAttr}></textarea>`;
    }
    if (field.fieldType === 'select') {
        return html`<select
            class="input"
            data-field-id="${id}"
            ${requiredAttr}>
            <option value="">
                Select...
            </option>
            ${field.options.map(
                o => html`<option
                    value="${o}"
                    >${o}</option>`,
            )}
        </select>`;
    }
    if (
        field.fieldType === 'radio'
        || field.fieldType
            === 'multi_select'
    ) {
        const inputType =
            field.fieldType === 'radio'
                ? 'radio' : 'checkbox';
        return html`<div
            class="flex flex-col
                gap-2">
            ${field.options.map(
                o => html`<label
                    class="flex
                        items-center
                        gap-2">
                    <input
                        type="${inputType}"
                        name="${id}"
                        value="${o}"
                        data-field-id
                            ="${id}" />
                    ${o}
                </label>`,
            )}
        </div>`;
    }
    const spec =
        FIELD_HTML_TYPE[field.fieldType];
    if (!spec) {
        return html`<input
            type="text"
            class="input"
            data-field-id="${id}"
            ${requiredAttr} />`;
    }
    if (spec.type === 'checkbox') {
        return html`<input
            type="checkbox"
            data-field-id="${id}"
            ${requiredAttr} />`;
    }
    const extra = spec.extra
        ? trusted(spec.extra)
        : html``;
    return html`<input
        type="${spec.type}"
        class="input"
        data-field-id="${id}"
        ${extra}
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

    constructor(
        workOrder: WorkOrderEntity,
        transitions:
            readonly WorkOrderTransitionEntity[],
        fieldValuesByTransition:
            ReadonlyMap<
                Id,
                readonly TransitionFieldValueEntity[]
            >,
        claims:
            readonly WorkOrderClaimEntity[],
        workerMap: Map<Id, Worker>,
        currentPersonId: string,
    ) {
        this.#workOrder = workOrder;
        this.#flowGraph =
            validateWorkOrderFlowGraph(
                workOrder.flow_graph,
            );

        const sorted = [...transitions]
            .sort(
                (a, b) =>
                    a.transitioned_at
                        .localeCompare(
                            b.transitioned_at,
                        ),
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
            fieldValuesByTransition,
            this.#flowGraph.nodes,
            workerMap,
        );

        const active = claims.find(
            c =>
                c.work_order_id
                    === workOrder.id
                && !isExpiredClaim(
                    c,
                    this.#flowGraph
                        .lockTimeout,
                ),
        );
        this.#claim = active
            ? {
                kind: 'claimed',
                claimId: active.id,
                byCurrentPerson:
                    active.person_id
                        === currentPersonId,
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

    renderableFields():
        readonly GraphField[] {
        return this.#currentNode.fields;
    }

    claimStatus(): ClaimStatus {
        return this.#claim;
    }

    buildPage(): SafeHtml {
        const complete = this.isArchive();

        const fields = complete
            ? html``
            : this.#buildFieldsCard();

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
            class="content-wrap">
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

    #buildFieldsCard(): SafeHtml {
        return html`<div
            id="work-order-fields"
            class="card mb-6 p-6">
            <h3 class="text-lg
                font-semibold mb-4">
                Fields
            </h3>
            ${this.renderableFields()
                .toSorted(
                    (a, b) =>
                        a.sortOrder
                        - b.sortOrder,
                )
                .map(
                    f =>
                        this.#buildFieldRow(f),
                )}
        </div>`;
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

    #buildFieldRow(
        field: GraphField,
    ): SafeHtml {
        const label = field.name
            + (field.isRequired ? ' *' : '');
        return html`<div class="mb-4">
            <label
                class="label">${label}</label>
            ${buildFieldInputHtml(field)}
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
        readonly WorkOrderTransitionEntity[],
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
        readonly WorkOrderTransitionEntity[],
    fieldValuesByTransition:
        ReadonlyMap<
            Id,
            readonly TransitionFieldValueEntity[]
        >,
    nodes: readonly GraphNode[],
    workerMap: Map<Id, Worker>,
): HistoryEntry[] {
    const fieldNameMap = new Map<
        string, string
    >();
    for (const node of nodes) {
        for (const f of node.fields) {
            fieldNameMap.set(f.id, f.name);
        }
    }

    return sortedTransitions.map(t => {
        const rows =
            fieldValuesByTransition.get(t.id)
            ?? [];
        const fieldValues:
            HistoryFieldValue[] = [];
        for (const row of rows) {
            const fieldName =
                fieldNameMap.get(row.field_id);
            if (!fieldName) {
                throw new Error(
                    'Field not found: '
                        + row.field_id,
                );
            }
            fieldValues.push({
                fieldName,
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
                workerMap, t.person_id,
            ),
            transitionedAt:
                t.transitioned_at,
            fieldValues,
        };
    });
}
