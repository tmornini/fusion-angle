import {
    html, trusted,
} from '../safe-html';
import type { SafeHtml } from '../safe-html';
import {
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
} from '../icons';
import type {
    GraphField,
    GraphNode,
    GraphEdge,
} from '../adapters';

export function buildFieldBadge(
    fieldType: string,
): SafeHtml {
    return html`<span
class="badge badge-outline text-xs"
>${fieldType}</span>`;
}

export function buildFieldRow(
    field: GraphField,
): SafeHtml {
    const req = field.isRequired
        ? html`<span class="${
            'text-xs flow-required-mark'
        }"> *</span>`
        : html``;
    return html`<div
class="flow-field-row"
data-field-id="${field.id}">
${buildFieldBadge(field.fieldType)}
<span class="text-sm"
    >${field.name}</span>
${req}
<button
    class="btn btn-ghost btn-xs ml-auto"
    data-action="delete-field"
    data-field-id="${field.id}"
    >&times;</button>
</div>`;
}

export function buildFieldEditor(
    nodeId: string | null,
): SafeHtml {
    if (!nodeId) {
        return html``;
    }
    return html`<div
class="flow-field-editor"
data-node-id="${nodeId}">
<h4 class="text-sm font-semibold mb-2"
    >Add Field</h4>
<div class="mb-2">
<input type="text"
    class="input input-sm"
    id="new-field-name"
    placeholder="Field name" />
</div>
<div class="mb-2">
<select class="input input-sm"
    id="new-field-type">
<option value="text">text</option>
<option value="textarea"
    >textarea</option>
<option value="number">number</option>
<option value="date">date</option>
<option value="select">select</option>
<option value="checkbox"
    >checkbox</option>
<option value="file">file</option>
<option value="email">email</option>
<option value="url">url</option>
<option value="phone">phone</option>
<option value="currency"
    >currency</option>
<option value="multi_select"
    >multi_select</option>
<option value="radio">radio</option>
<option value="image">image</option>
</select>
</div>
<div class="mb-2">
<label class="text-sm">
<input type="checkbox"
    id="new-field-required" />
Required</label>
</div>
<div class="mb-2">
<textarea
    class="input input-sm"
    id="new-field-options"
    placeholder="${
        'Options (one per line)'
    }"
    rows="2"></textarea>
</div>
<button class="btn btn-primary btn-xs"
    data-action="save-field"
    >Add</button>
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
    >${iconCheck(16, '')}</button>
<button class="${
    'btn btn-ghost btn-icon'
}" id="flow-name-cancel-btn"
    >${iconX(16, '')}</button>
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
    >${iconEdit(14, '')}</button>
</div>`;
}

export function buildNodePanel(
    node: GraphNode,
    outgoing: GraphEdge[],
    isLocked: boolean,
): SafeHtml {
    const isSpecial =
        node.isStart || node.isComplete;
    if (isSpecial) {
        const kind = node.isStart
            ? 'Start' : 'End';
        return html`<div
class="flow-props-panel">
<div class="flow-props-header"
><h3 class="text-sm font-semibold"
    >${kind} State</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<div class="text-sm">${node.name}</div>
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Outgoing Transitions</label>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>\u2192 ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
    }
    const fieldRows = node.fields
        .map(f => buildFieldRow(f));
    const lockAttr =
        trusted(isLocked ? ' disabled' : '');
    return html`<div
class="flow-props-panel">
<div class="flow-props-header"
><h3 class="text-sm font-semibold"
    >State Properties</h3>
<button
    class="btn btn-ghost btn-icon btn-xs"
    data-action="close-panel"
    aria-label="Close"
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<input type="text"
    class="input input-sm"
    id="prop-node-name"
    value="${node.name}"${lockAttr} />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Description</label>
<input type="text"
    class="input input-sm"
    id="prop-node-desc"
    value="${node.description}"${
    lockAttr} />
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Fields</label>
${fieldRows}
<button
    class="btn btn-ghost btn-xs mt-1"
    data-action="add-field"
    >+ Add Field</button>
<div id="field-editor-slot"></div>
</div>
<div class="mb-3">
<label class="text-xs text-muted"
    >Outgoing Transitions</label>
${outgoing.length > 0
    ? outgoing.map(e => html`<div
class="text-sm text-muted"
>\u2192 ${e.name}</div>`)
    : html`<div class="text-sm text-muted"
        >None</div>`}
</div>
</div>`;
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
    >${iconX(14, '')}</button>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Name</label>
<input type="text"
    class="input input-sm"
    id="prop-edge-name"
    value="${edge.name}"${lockAttr} />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >Description</label>
<input type="text"
    class="input input-sm"
    id="prop-edge-desc"
    value="${edge.description}"${
    lockAttr} />
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >From</label>
<div class="text-sm">${fromName}</div>
</div>
<div class="mb-2">
<label class="text-xs text-muted"
    >To</label>
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
    }>${iconUndo(18, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="redo"
    title="Redo"
    aria-label="Redo"${
    trusted(canRedo ? '' : ' disabled')
    }>${iconRedo(18, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-out"
    title="Zoom out"
    aria-label="Zoom out"
    >${iconMinus(18, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="zoom-in"
    title="Zoom in"
    aria-label="Zoom in"
    >${iconPlus(18, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="copy-mermaid"
    title="Copy Mermaid"
    aria-label="Copy Mermaid"
    >${iconCopy(18, '')}</button>
<button
    class="btn btn-ghost btn-icon"
    data-action="export-zip"
    title="Export ZIP"
    aria-label="Export ZIP"
    >${iconDownload(18, '')}</button>
</div>
<div class="flow-toolbar-spacer"></div>
<div class="flow-toolbar-group">
<button
    class="btn btn-ghost btn-icon"
    data-action="delete-selected"
    title="Delete"
    aria-label="Delete"${
    trusted(canDelete ? '' : ' disabled')
    }>${iconTrash(18, '')}</button>
</div>
</div>`;
}
