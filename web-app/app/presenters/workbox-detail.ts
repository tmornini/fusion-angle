import {
    html, trusted, escapeForHtml,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import { idLabel } from './id-label.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    memberName,
    type WorkOrder,
    type TransitionEvent,
    type StateFieldValue,
    type RecordAttribute,
    type HistoryEntry,
    type HistoryFieldValue,
    type ClaimStatus,
} from '../../../client/index.ts';
import {
    type ConstraintViolation,
} from '../../../shared/record-constraints.ts';
import {
    type WorkOrderFlowGraph,
    type GraphNode,
    type GraphEdge,
    type NodeAttribute,
} from '../../../shared/types.ts';
import type { Member } from '../../../shared/types.ts';
import type { Id } from '../../../shared/types.ts';
import {
    ICON_SIZE,
    iconCheck,
    iconXCircle,
} from '../icons.ts';
import {
    buildErrorState,
    buildSkeleton,
} from '../loading-states.ts';
import { mutedEmptyNote } from './empty-note.ts';
import {
    formatViolation,
} from '../../../shared/record-constraints.ts';

const ATTRIBUTE_HTML_TYPE: Record<
    string,
    { type: string }
> = {
    text: { type: 'text' },
    number: { type: 'number' },
    date: { type: 'date' },
    checkbox: { type: 'checkbox' },
};

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
    const titleAttr = html``;
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

// The box's close control, in every state an opened work
// order takes: loading, failed, and loaded.
function buildWorkOrderClose(): SafeHtml {
    return html`<button
        type="button"
        class="btn btn-ghost btn-icon"
        id="work-order-close"
        aria-label="Close work order"
        title="Close work order">
        ${iconXCircle(ICON_SIZE.xl, '')}
    </button>`;
}

// The claim's button, named for what pressing it does:
// Claim alone, or Release after the words saying who holds
// the work order.
function buildClaimButton(heldBy: string | null): SafeHtml {
    const held = heldBy === null
        ? html``
        : html`${iconCheck(ICON_SIZE.sm, '')}${heldBy}`;
    return html`<span
        id="work-order-claim"
        class="flex items-center gap-2 text-sm">${held}<button
        type="button"
        class="btn btn-sm ${
            heldBy === null ? 'btn-primary' : 'btn-outline'
        }"
        id="work-order-claim-btn"
        data-claim="${heldBy === null ? 'claim' : 'release'}">${
            heldBy === null ? 'Claim' : 'Release'
        }</button></span>`;
}

// Before anything is opened, and after it is closed.
export function buildWorkOrderBoxEmpty(): SafeHtml {
    return html`<h2 class="text-lg font-semibold mb-4"
        >Work Order</h2>
    <div class="workbox-work-order-empty">${
        mutedEmptyNote('Select a work order to open it here')
    }</div>`;
}

// Its read in flight: the skeleton.
export function buildWorkOrderBoxLoading(): SafeHtml {
    return html`<div class="flex justify-end mb-2">${
        buildWorkOrderClose()
    }</div>${buildSkeleton('detail', 4)}`;
}

// Its read failed: the page's failed-load state.
export function buildWorkOrderBoxFailed(
    message: string,
): SafeHtml {
    return html`<div class="flex justify-end mb-2">${
        buildWorkOrderClose()
    }</div>${buildErrorState(message, 'Try Again')}`;
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
    readonly #conflictNotice: string | null;
    readonly #activeClaim:
        { memberId: Id; at: string } | null;
    readonly #memberMap: Map<Id, Member>;
    readonly #currentMemberId: string;

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
        _pickerItems:
            readonly InstancePickerItem[] = [],
        conflictNotice: string | null = null,
    ) {
        this.#workOrder = workOrder;
        this.#flowGraph = workOrder.flowGraph;
        this.#attributeMap = attributeMap;
        this.#instanceValues = instanceValues;
        this.#binding = binding;
        this.#conflictNotice = conflictNotice;
        this.#activeClaim = activeClaim;
        this.#memberMap = memberMap;
        this.#currentMemberId = currentMemberId;

        const head = this.#flowGraph.nodes.find(
            (n) => n.id === workOrder.nodeId,
        );
        if (head === undefined) {
            throw new Error(
                'invariant violated: the head names'
                + ' unknown node ' + workOrder.nodeId,
            );
        }
        this.#currentNode = head;
        this.#outgoingEdges =
            this.#flowGraph.edges.filter(
                e => e.fromNodeId
                    === this.#currentNode.id,
            );
        this.#history = buildHistory(
            transitions,
            fieldValuesByEvent,
            this.#flowGraph.nodes,
            memberMap,
            attributeMap,
        );

        this.#claim = activeClaim
            ? {
                state: 'claimed',
                at: activeClaim.at,
                byCurrentMember:
                    activeClaim.memberId
                        === currentMemberId,
            }
            : { state: 'unclaimed' };
    }

    idValue(): string {
        return this.#workOrder.id;
    }

    flowNameText(): string {
        return this.#flowGraph.name;
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

        // The title row carries the claim place and the
        // close control at its right end, on a line below
        // when the title has no room beside them; the
        // badges take their own row. Attributes are two columns so
        // submit stays below them and still in view.
        return html`<div>
            <div id="work-order-header" class="mb-6">
                <div class="flex flex-wrap items-center
                    gap-3 mb-2">
                    <h2 class="${
                        'work-order-title text-xl font-bold'
                        + ' flex-1 min-w-0'
                    }">${this.flowNameText()}</h2>
                    <div class="flex items-center gap-2 ml-auto">
                        ${this.#buildClaimPlace()}
                        ${buildWorkOrderClose()}
                    </div>
                </div>
                <div class="flex
                    items-center gap-3
                    flex-wrap">
                    <span
                        class="badge
                            badge-neutral">
                        ${idLabel(
                            'Work order',
                            this.idValue(),
                        )}
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

            ${conflict}
            ${fields}
            ${violationsSlot}
            ${transitions}

            <details
                id="work-order-history"
                open>
                <summary
                    class="text-lg
                        font-semibold mb-3
                        cursor-pointer">
                    History
                </summary>
                <div>
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

    // The claim's one place: Claim while the work order is
    // unclaimed, my name and Release while I hold it, the
    // holder's name while another member does, nothing once
    // it is archived. A lapsed claim is no claim: the page
    // passes none.
    #buildClaimPlace(): SafeHtml {
        if (this.isArchive()) {
            return html``;
        }
        const claim = this.#activeClaim;
        if (claim === null) {
            return buildClaimButton(null);
        }
        const label = 'Claimed by '
            + memberName(this.#memberMap, claim.memberId);
        if (claim.memberId === this.#currentMemberId) {
            return buildClaimButton(label);
        }
        return html`<span
            id="work-order-claim"
            class="text-sm text-muted">${label}</span>`;
    }

    #claimedByMe(): boolean {
        return this.#claim.state === 'claimed'
            && this.#claim.byCurrentMember;
    }

    #bindingBadge(): SafeHtml {
        const bind = this.#binding;
        if (bind === null) {
            return html``;
        }
        return html`<a
            href="${buildPageUrl('record-detail', {
                id: bind.recordTypeId,
                instance: bind.instanceId,
            })}"
            class="badge badge-success"
            data-binding="bound"
            title="${
                'type ' + bind.recordTypeId
            }">
            ${idLabel('Instance', bind.instanceId)}
        </a>`;
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
        const disabledAttr = this.#claimedByMe()
            ? html``
            : trusted('disabled');
        return html`<div
            id="work-order-transitions"
            class="flex gap-3 mb-6
                flex-wrap">
            ${this.#outgoingEdges.map(
                e => html`<button
                    class="btn btn-primary"
                    data-edge-id="${e.id}"
                    ${disabledAttr}>
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
                class="mt-2
                    work-order-history-fields">
                ${entry.fieldValues.map(
                    fv => html`
                    <span
                        class="text-muted"
                    >${fv.fieldName}</span>
                    ${'cleared' in fv
                        ? html`<span class="text-muted italic">cleared</span>`
                        : html`<span>${fv.value}</span>`}`,
                )}
            </div>`
            : html``;
        return html`<div
            class="py-3 border-b">
            <div
                class="flex items-start
                    gap-3"
            >
                <div class="flex-fill">
                    <div
                        class="font-semibold"
                    >${entry.fromNodeName}
                        &rarr;
                        ${entry.toNodeName}</div>
                    <div
                        class="text-muted
                            text-sm"
                    >${entry.memberName}</div>
                </div>
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
            !this.#claimedByMe();
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
    transitions:
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
    return transitions.map(t => {
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
            fieldValues.push(
                'cleared' in row
                    ? {
                        fieldName: attribute.name,
                        cleared: true,
                    }
                    : {
                        fieldName: attribute.name,
                        value: row.value,
                    },
            );
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
