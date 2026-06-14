import {
    html, trusted,
} from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import {
    ICON_SIZE,
    iconUndo,
    iconRedo,
    iconTrash,
    iconX,
    iconEdit,
    iconCheck,
    iconMinus,
    iconPlus,
    iconCopy,
    iconDownload,
} from '../icons.ts';
import type {
    GraphNode,
    GraphEdge,
    NodeAttribute,
    RecordAttribute,
} from '../adapters/index.ts';
import {
    HumanMember,
    AIMember,
    MEMBER_WITHOUT_PII_NAME,
} from '../adapters/index.ts';

export function buildAttributeRefRow(
    ref: NodeAttribute,
    attribute: RecordAttribute,
    isLocked: boolean,
): SafeHtml {
    const disabledAttr = trusted(
        isLocked ? ' disabled' : '',
    );
    const requiredDisabled = trusted(
        isLocked ? ' disabled' : '',
    );
    const requiredChecked = trusted(
        ref.isRequired ? ' checked' : '',
    );
    const editableSel = trusted(
        ref.mode === 'editable'
            ? ' selected' : '',
    );
    const readonlySel = trusted(
        ref.mode === 'readonly'
            ? ' selected' : '',
    );
    return html`<div
class="flow-attribute-ref-row"
data-attribute-id="${attribute.id}">
<span class="text-sm flow-attribute-name"
    >${attribute.name}</span>
<select
    class="input input-sm"
    data-action="update-attribute-mode"
    data-attribute-id="${attribute.id}"${
    disabledAttr}>
<option value="editable"${editableSel}
    >Editable</option>
<option value="readonly"${readonlySel}
    >Read-only</option>
</select>
<label class="text-xs">
<input type="checkbox"
    data-action="update-attribute-required"
    data-attribute-id="${attribute.id}"${
    requiredChecked}${requiredDisabled} />
Required</label>
<button
    class="btn btn-ghost btn-xs"
    data-action="remove-attribute-ref"
    data-attribute-id="${attribute.id}"${
    disabledAttr}
    >&times;</button>
</div>`;
}

export function buildFlowNameHeader(
    flowName: string,
    isEditingName: boolean,
): SafeHtml {
    if (isEditingName) {
        return html`<div class="${
            'flex items-center'
            + ' gap-2'
        }">
<input class="input flow-name-input"
    id="flow-name-input"
    value="${flowName}" />
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-save-btn"
    >${iconCheck(ICON_SIZE.base, '')}</button>
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-cancel-btn"
    >${iconX(ICON_SIZE.base, '')}</button>
</div>`;
    }
    return html`<div class="${
        'flex items-center'
        + ' gap-2'
    }">
<h2 class="${
    'text-lg font-semibold'
}">${flowName}</h2>
<button class="${
    'btn btn-ghost btn-icon'
    + ' flow-name-edit-btn'
}" id="flow-name-edit-btn"
    >${iconEdit(ICON_SIZE.sm, '')}</button>
</div>`;
}

export function buildNodePanel(
    node: GraphNode,
    outgoing: GraphEdge[],
    isLocked: boolean,
    humans: HumanMember[],
    ais: AIMember[],
    attributes: readonly RecordAttribute[],
): SafeHtml {
    const isSpecial =
        node.isCreate || node.isArchive;
    if (isSpecial) {
        const label = node.name;
        return html`<div
class="flow-props-panel">
<div class="flow-props-header"
><h3 class="text-sm font-semibold"
    >${label}</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(ICON_SIZE.sm, '')}</button>
</div>
<div class="mb-2">
<div class="text-xs text-muted"
    >Name</div>
<div class="text-sm">${label}</div>
</div>
<div class="mb-3">
<div class="text-xs text-muted"
    >Outgoing Transitions</div>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>→ ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
    }
    const attributeById = new Map(
        attributes.map(
            a => [a.id, a] as const,
        ),
    );
    const refRows = node.attributes.map(ref => {
        const attribute = attributeById.get(
            ref.attributeId,
        );
        if (!attribute) {
            return html`<div
class="text-xs text-muted"
>Missing attribute</div>`;
        }
        return buildAttributeRefRow(
            ref, attribute, isLocked,
        );
    });
    const referencedIds = new Set(
        node.attributes.map(
            r => r.attributeId,
        ),
    );
    const pickerAttributes = attributes
        .filter(a => !referencedIds.has(a.id))
        .toSorted(
            (a, b) =>
                a.name.localeCompare(b.name),
        );
    const pickerDisabled = trusted(
        isLocked || pickerAttributes.length === 0
            ? ' disabled' : '',
    );
    const lockAttr =
        trusted(isLocked ? ' disabled' : '');
    const humanName = (h: HumanMember): string => {
        const p = h.pii();
        return p.erased
            ? MEMBER_WITHOUT_PII_NAME
            : p.name;
    };
    const sortedHumans = [...humans].sort(
        (a, b) => humanName(a).localeCompare(
            humanName(b),
        ),
    );
    const sortedAis = [...ais].sort(
        (a, b) => a.nameText().localeCompare(
            b.nameText(),
        ),
    );
    const assigned = new Set(node.memberIds);
    const humanCheckboxes = sortedHumans.map(
        h => buildMemberCheckbox(
            h.idForLink(),
            humanName(h),
            assigned.has(h.idForLink()),
            isLocked,
        ),
    );
    const aiCheckboxes = sortedAis.map(
        a => buildMemberCheckbox(
            a.idForLink(),
            a.nameText(),
            assigned.has(a.idForLink()),
            isLocked,
        ),
    );
    return html`<div
class="flow-props-panel">
<div class="flow-props-header"
><h3 class="text-sm font-semibold"
    >State Properties</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(ICON_SIZE.sm, '')}</button>
</div>
<fieldset class="member-select-fieldset"
    id="prop-node-members">
<legend class="text-xs text-muted"
    >Members</legend>
<div class="member-group">
<div class="member-group-label"
    >HUMANS</div>
${humanCheckboxes}
</div>
<div class="member-group">
<div class="member-group-label"
    >AIs</div>
${aiCheckboxes}
</div>
</fieldset>
<div class="mb-2">
<label class="text-xs text-muted"
    for="prop-node-name">Name</label>
<input type="text"
    class="input input-sm"
    id="prop-node-name"
    value="${node.name}"${lockAttr} />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    for="prop-node-instructions"
    >Task Instructions</label>
<textarea
    class="textarea"
    id="prop-node-instructions"
    rows="4"${lockAttr}
    >${node.taskInstructions}</textarea>
</div>
<fieldset class="flow-attribute-fieldset"
    id="prop-node-attributes">
<legend class="text-xs text-muted"
    >Attributes</legend>
${refRows}
<div class="flow-attribute-picker">
<select
    class="input input-sm"
    id="prop-node-attribute-picker"${
    pickerDisabled}>
<option value="">+ Add Attribute…</option>
${pickerAttributes.map(
    a => html`<option
        value="${a.id}"
        >${a.name}</option>`,
)}
</select>
</div>
</fieldset>
<div class="mb-3">
<div class="text-xs text-muted"
    >Outgoing Transitions</div>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>→ ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
}

function buildMemberCheckbox(
    memberId: string,
    name: string,
    checked: boolean,
    isLocked: boolean,
): SafeHtml {
    const checkedAttr = trusted(
        checked ? ' checked' : '',
    );
    const disabledAttr = trusted(
        isLocked ? ' disabled' : '',
    );
    return html`<label
class="member-checkbox-label">
<input type="checkbox"
    data-member-id="${memberId}"${
    checkedAttr}${disabledAttr} />
<span>${name}</span>
</label>`;
}

export function buildEdgePanel(
    edge: GraphEdge,
    fromNode: GraphNode,
    toNode: GraphNode,
    isLocked: boolean,
): SafeHtml {
    const fromName = fromNode.name;
    const toName = toNode.name;
    const lockAttr =
        trusted(isLocked ? ' disabled' : '');
    return html`<div
class="flow-props-panel">
<div class="flow-props-header"
><h3 class="text-sm font-semibold"
    >Transition Properties</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(ICON_SIZE.sm, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    for="prop-edge-name">Name</label>
<input type="text"
    class="input input-sm"
    id="prop-edge-name"
    value="${edge.name}"${lockAttr} />
</div>
<div class="mb-2">
<div class="text-xs text-muted"
    >From</div>
<div class="text-sm">${fromName}</div>
</div>
<div class="mb-2">
<div class="text-xs text-muted"
    >To</div>
<div class="text-sm">${toName}</div>
</div>
</div>`;
}

export function buildToolbar(
    canUndo: boolean,
    canRedo: boolean,
    canDelete: boolean,
): SafeHtml {
    return html`<div
class="flow-toolbar">
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="undo"
    title="Undo"
    aria-label="Undo"${
    trusted(canUndo ? '' : ' disabled')
    }>${iconUndo(ICON_SIZE.lg, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="redo"
    title="Redo"
    aria-label="Redo"${
    trusted(canRedo ? '' : ' disabled')
    }>${iconRedo(ICON_SIZE.lg, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-out"
    title="Zoom out"
    aria-label="Zoom out"
    >${iconMinus(ICON_SIZE.lg, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-in"
    title="Zoom in"
    aria-label="Zoom in"
    >${iconPlus(ICON_SIZE.lg, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="copy-mermaid"
    title="Copy Mermaid"
    aria-label="Copy Mermaid"
    >${iconCopy(ICON_SIZE.lg, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="export-zip"
    title="Export ZIP"
    aria-label="Export ZIP"
    >${iconDownload(ICON_SIZE.lg, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="delete-selected"
    title="Delete"
    aria-label="Delete"${
    trusted(canDelete ? '' : ' disabled')
    }>${iconTrash(ICON_SIZE.lg, '')}</button>
</div>
</div>`;
}
