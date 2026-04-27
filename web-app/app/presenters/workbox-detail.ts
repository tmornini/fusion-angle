import {
    html, trusted,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    userName,
    validateWorkOrderFlowGraph,
    parseTransitionValues,
    isExpiredClaim,
    type WorkOrderEntity,
    type WorkOrderTransitionEntity,
    type WorkOrderClaimEntity,
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type GraphField,
    type HistoryEntry,
    type HistoryFieldValue,
    type ClaimStatus,
    type Id,
} from '../adapters/index.ts';
import type { User } from '../adapters/index.ts';

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
        claims:
            readonly WorkOrderClaimEntity[],
        userMap: Map<Id, User>,
        currentUserId: string,
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
            this.#flowGraph.nodes,
            userMap,
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
                byCurrentUser:
                    active.user_id
                        === currentUserId,
            }
            : { kind: 'unclaimed' };
    }

    idValue(): string {
        return this.#workOrder.id;
    }

    displayIdText(): string {
        return this.#workOrder.display_id;
    }

    flowNameText(): string {
        return this.#flowGraph.name;
    }

    outgoingEdgeList():
        readonly GraphEdge[] {
        return this.#outgoingEdges;
    }

    historyEntries():
        readonly HistoryEntry[] {
        return this.#history;
    }

    hasHistory(): boolean {
        return this.#history.length > 0;
    }

    isComplete(): boolean {
        return this.#currentNode.isComplete;
    }

    currentNodeName(): string {
        return this.#currentNode.name;
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
}

function findCurrentNode(
    nodes: readonly GraphNode[],
    sortedTransitions:
        readonly WorkOrderTransitionEntity[],
): GraphNode {
    const lastToId = sortedTransitions
        .at(-1)?.to_node_id;
    const node = nodes.find(
        n => n.id === lastToId,
    );
    if (!node) {
        throw new Error(
            'Current node not found'
            + ` in flow graph: ${lastToId}`,
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
    nodes: readonly GraphNode[],
    userMap: Map<Id, User>,
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
        const vals =
            parseTransitionValues(t.values);
        const fieldValues:
            HistoryFieldValue[] = [];
        for (
            const [fId, val]
            of Object.entries(vals)
        ) {
            const fieldName =
                fieldNameMap.get(fId);
            if (!fieldName) {
                throw new Error(
                    'Field not found: '
                        + fId,
                );
            }
            fieldValues.push({
                fieldName, value: val,
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
            userName: userName(
                userMap, t.user_id,
            ),
            transitionedAt:
                t.transitioned_at,
            fieldValues,
        };
    });
}
