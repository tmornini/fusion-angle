# Mermaid Bidirectional Flow Compatibility

## Context

The flow system is a graph-based workflow engine with nodes
(states), edges (transitions), and fields (form inputs on
nodes). It renders as hand-crafted SVG with full interactivity
(drag, connect, pan, zoom, undo/redo).

Mermaid is an open-source text-based diagramming language widely
supported in GitHub, GitLab, Notion, wikis, and documentation
tools. Its `flowchart` syntax maps naturally to our node/edge
model.

This feature adds bidirectional Mermaid compatibility: export
flows as Mermaid text and ZIP bundles, and import flows from
Mermaid text or ZIP bundles. The goal is interoperability with
the Mermaid ecosystem while preserving full fidelity for
round-trip workflows within the app.

## Diagram Type

**Mermaid `flowchart`** (not `stateDiagram`). Flowchart is the
most widely supported Mermaid type, renders everywhere, and
offers flexible node shapes to distinguish start/end states by
convention.

## New Modules

### `web-app/app/mermaid-generate.ts`

Converts a `FlowGraph` to Mermaid flowchart text.

**Input:** `FlowGraph` (from `adapters/flows.ts`)
**Output:** `string` (valid Mermaid `flowchart LR` syntax)

Mapping rules:
- Direction: `LR` (matches left-to-right flow layout)
- Start nodes (`isStart`): stadium shape `([Name])`
- Complete nodes (`isComplete`): double-circle `(((Name)))`
- Regular nodes: rectangle `[Name]`
- Node IDs: sanitized from entity IDs (e.g., `wn_1`)
- Edges: `nodeA -->|label| nodeB`
- Unlabeled edges (empty name): `nodeA --> nodeB`

Example output for Customer Onboarding:
```
flowchart LR
  wn_1([New])
  wn_2[Data Capture]
  wn_3[Review]
  wn_4(((Complete)))

  wn_1 -->|begin| wn_2
  wn_2 -->|submit| wn_3
  wn_3 -->|needs revision| wn_2
  wn_3 -->|approve| wn_4
```

### `web-app/app/mermaid-parse.ts`

Parses Mermaid flowchart text into a structure compatible with
the adapter layer for flow creation.

**Input:** `string` (Mermaid flowchart text)
**Output:** `ParsedFlowchart` — interface with:
- `nodes: ParsedNode[]` — `{mermaidId, name, isStart, isComplete}`
- `edges: ParsedEdge[]` — `{fromId, toId, name}`
- `warnings: string[]` — skipped syntax descriptions

Supported subset:
```
flowchart (LR|TD|TB|BT|RL)
  nodeId[Label]              # rectangle -> regular node
  nodeId([Label])            # stadium -> isStart
  nodeId(((Label)))          # double-circle -> isComplete
  nodeId -->|label| nodeId   # labeled edge
  nodeId --> nodeId          # unlabeled edge
  nodeId -.->|label| nodeId  # dotted edge (treated as normal)
  nodeId ==>|label| nodeId   # thick edge (treated as normal)
```

Behavior:
- Extracts node declarations and infers type from shape syntax
- Extracts edge declarations with optional labels
- Skips unsupported syntax (`classDef`, `click`, `style`,
  `subgraph`, `:::`) with a warning toast listing what was
  skipped
- Assigns positions via `computeLayout()` from `flow-layout.ts`
- If no node has stadium shape, the first node with no incoming
  edges is marked `isStart`
- If no node has double-circle shape, the first node with no
  outgoing edges is marked `isComplete`

### `web-app/app/mermaid-zip.ts`

Minimal stored-ZIP reader/writer. No compression (store method
0), just container headers and raw data.

Functions:
- `buildZip(files: {name: string; data: Uint8Array}[]): Uint8Array`
- `readZip(data: Uint8Array): {name: string; data: Uint8Array}[]`

Implementation: standard ZIP format with local file headers,
file data, central directory entries, and end-of-central-directory
record. CRC-32 computed per entry. No compression — file data
stored raw. Approximately 100-150 lines.

## Adapter Functions

Added to `web-app/app/adapters/flows.ts`:

### Export

- `exportFlowMermaid(flowId: string): Promise<string>`
  Fetches `FlowGraph` via `getFlowGraph()`, passes to
  `generateMermaid()`, returns Mermaid text.

- `exportFlowZip(flowId: string): Promise<Uint8Array>`
  Fetches `FlowGraph`, generates both `flow.mmd` (Mermaid text)
  and `flow.json` (sidecar metadata), bundles via `buildZip()`.

### Import

- `importFlowFromMermaid(text: string, projectId: string): Promise<string>`
  Parses Mermaid text, creates flow via `postFlowCreation()`,
  adds nodes via `postNodeAddition()`, connects edges via
  `postEdgeConnection()`. Returns new flow ID.

- `importFlowFromZip(data: Uint8Array, projectId: string): Promise<string>`
  Extracts ZIP, reads `flow.mmd` and `flow.json`. Parses
  Mermaid for structure, enriches with sidecar metadata
  (positions, fields, descriptions). Creates flow with full
  fidelity. Returns new flow ID.

## ZIP Bundle Format

Filename: `{flow-name}.zip`

```
flow.txt          # Flow ID and export timestamp
flow.mmd          # Clean Mermaid flowchart text
flow.json         # Sidecar metadata
```

### `flow.txt`

```
flowId: wf-1
exportedAt: 2026-04-03T12:00:00.000000Z
```

### `flow.json` Schema

```json
{
  "version": 1,
  "name": "Customer Onboarding",
  "description": "Standard onboarding process",
  "nodes": [
    {
      "mermaidId": "wn_1",
      "name": "New",
      "description": "Entry point",
      "positionX": 40,
      "positionY": 30,
      "isStart": true,
      "isComplete": false,
      "fields": [
        {
          "name": "Company Name",
          "fieldType": "text",
          "sortOrder": 1,
          "isRequired": true,
          "options": []
        }
      ]
    }
  ],
  "edges": [
    {
      "mermaidFrom": "wn_1",
      "mermaidTo": "wn_2",
      "name": "begin",
      "description": ""
    }
  ]
}
```

The `mermaidId`, `mermaidFrom`, `mermaidTo` fields correlate
sidecar entries to Mermaid node/edge declarations for round-trip
matching.

## UI Changes

### Flow Detail Toolbar

New toolbar group in `FlowDesignerPresenter.#buildToolbar()`,
placed before the stats group:

```html
<div class="wf-toolbar-group">
  <button class="btn btn-ghost btn-sm"
      data-action="copy-mermaid">Copy Mermaid</button>
  <button class="btn btn-ghost btn-sm"
      data-action="export-zip">Export .zip</button>
</div>
```

- **Copy Mermaid**: calls `exportFlowMermaid()`, writes to
  clipboard via `navigator.clipboard.writeText()`, shows toast
  "Mermaid copied to clipboard"
- **Export .zip**: calls `exportFlowZip()`, triggers browser
  download via blob URL with filename `{flow-name}.zip`

### Flow List Page

Add an "Import Flow" button in the page header
(`web-app/flow/index.html`), beside the Flows title:

```html
<button class="btn btn-primary btn-sm"
    id="import-flow-btn">Import Flow</button>
```

Hidden file input accepting `.mmd,.zip`:

```html
<input type="file" id="import-flow-input"
    accept=".mmd,.zip" class="hidden">
```

Behavior in `web-app/flow/index.ts`:
1. Click "Import Flow" triggers the hidden file input
2. On file selection, detect format by extension
3. `.mmd`: read as text, call `importFlowFromMermaid()`
4. `.zip`: read as ArrayBuffer, call `importFlowFromZip()`
5. On success, navigate to the new flow's detail page
6. On parse error, show toast with error message

Import requires a project association. Since flows are normally
created from the project detail page, the import button opens
a dialog with a project dropdown and a file picker. The user
selects the target project, then selects the file. If only one
project exists, the dropdown is pre-selected.

## Round-Trip Behavior

| Scenario | Fidelity |
|----------|----------|
| Export ZIP -> Import ZIP | Full: positions, fields, descriptions preserved |
| Export -> Import .mmd only | Lossy: nodes + edges preserved, auto-layout, no fields/descriptions |
| External .mmd -> Import | Best-effort: shapes infer start/end, auto-layout |
| Export -> Edit .mmd -> Import ZIP | Structure from .mmd, metadata enriched from sidecar |

When importing a ZIP, the `.mmd` is the source of truth for
graph structure (nodes and edges). The sidecar enriches nodes
matched by `mermaidId` with positions, fields, and descriptions.
If the `.mmd` has been edited (nodes added/removed), unmatched
sidecar entries are ignored and new nodes get defaults.

## Files to Create

- `web-app/app/mermaid-generate.ts`
- `web-app/app/mermaid-parse.ts`
- `web-app/app/mermaid-zip.ts`

## Files to Modify

- `web-app/app/adapters/flows.ts` — add export/import functions
- `web-app/app/adapters/index.ts` — re-export new functions
- `web-app/app/presenters/flow-designer.ts` — add toolbar
  buttons and action handlers
- `web-app/flow/index.html` — add Import button and hidden
  file input
- `web-app/flow/index.ts` — add import click handler and file
  processing

## Verification

1. Load mock data (Customer Onboarding flow exists)
2. Open flow detail page
3. Click "Copy Mermaid" — paste into Mermaid Live Editor,
   verify it renders correctly
4. Click "Export .zip" — verify download, unzip, confirm
   `flow.mmd` and `flow.json` are present and well-formed
5. Navigate to flow list, click "Import Flow", select the
   exported `.zip` — verify new flow created with same
   structure, positions, and fields
6. Create a simple `.mmd` file externally, import it — verify
   nodes/edges created with auto-layout and inferred start/end
7. Export a flow, edit the `.mmd` inside the zip (add a node),
   re-import — verify new node appears with default position,
   existing nodes retain sidecar metadata
