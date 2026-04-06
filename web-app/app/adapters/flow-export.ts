import { POST, PUT } from '../../../api/api';
import { nowUtc } from '../../../api/types';
import { parseJson } from './helpers';
import {
    getFlowGraph,
} from './flow-queries';
import type { FlowGraph } from './flow-queries';
import {
    postEdgeConnection,
    postFieldAddition,
    putWfEdge,
} from './flow-mutations';
import {
    generateMermaid,
} from '../mermaid-generate';
import { parseMermaid } from '../mermaid-parse';
import type {
    ParsedNode,
} from '../mermaid-parse';
import {
    buildZip, readZip,
} from '../zip';
import {
    computeLayout,
} from '../flow-layout';
import type {
    LayoutInput, LayoutEdge,
} from '../flow-layout';

/* ── Mermaid export ──────────────── */

export async function exportFlowMermaid(
    flowId: string,
): Promise<string> {
    const graph =
        await getFlowGraph(flowId);
    return generateMermaid(graph);
}

interface SidecarField {
    name: string;
    fieldType: string;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

interface SidecarNode {
    mermaidId: string;
    name: string;
    description: string;
    positionX: number;
    positionY: number;
    isStart: boolean;
    isComplete: boolean;
    fields: SidecarField[];
}

interface SidecarEdge {
    mermaidFrom: string;
    mermaidTo: string;
    name: string;
    description: string;
}

function sanitizeId(id: string): string {
    return id.replaceAll('-', '_');
}

function buildSidecar(
    graph: FlowGraph,
): string {
    const nodes: SidecarNode[] =
        graph.nodes.map(n => ({
            mermaidId: sanitizeId(n.id),
            name: n.name,
            description: n.description,
            positionX: n.positionX,
            positionY: n.positionY,
            isStart: n.isStart,
            isComplete: n.isComplete,
            fields: n.fields.map(f => ({
                name: f.name,
                fieldType: f.fieldType,
                sortOrder: f.sortOrder,
                isRequired: f.isRequired,
                options: f.options,
            })),
        }));
    const edges: SidecarEdge[] =
        graph.edges.map(e => ({
            mermaidFrom:
                sanitizeId(e.fromNodeId),
            mermaidTo:
                sanitizeId(e.toNodeId),
            name: e.name,
            description: e.description,
        }));
    return JSON.stringify({
        version: 1,
        name: graph.name,
        description: graph.description,
        nodes,
        edges,
    }, null, 2);
}

function minuteUtc(
    timeSep: string,
): string {
    const iso = new Date()
        .toISOString()
        .slice(0, 16) + 'Z';
    return timeSep === ':'
        ? iso
        : iso.replaceAll(':', timeSep);
}

function buildFlowTxt(
    flowId: string,
): string {
    return 'flowId: ' + flowId + '\n'
        + 'exportedAt: '
        + minuteUtc(':') + '\n';
}

export async function exportFlowZip(
    flowId: string,
): Promise<{
    data: Uint8Array;
    name: string;
}> {
    const graph =
        await getFlowGraph(flowId);

    const enc = new TextEncoder();
    const mmd =
        enc.encode(generateMermaid(graph));
    const json =
        enc.encode(buildSidecar(graph));
    const txt =
        enc.encode(buildFlowTxt(flowId));

    const data = buildZip([
        { name: 'flow.txt', data: txt },
        { name: 'flow.mmd', data: mmd },
        { name: 'flow.json', data: json },
    ]);

    const safeName = graph.name
        .replaceAll(
            /[^a-zA-Z0-9_-]/g, '-',
        )
        .toLowerCase();

    return {
        data,
        name: safeName
            + '-' + minuteUtc('-')
            + '.zip',
    };
}

/* ── Mermaid import ──────────────── */

const IMPORT_CANVAS_W = 1200;
const IMPORT_CANVAS_H = 800;

function layoutParsedNodes(
    nodes: ParsedNode[],
    edges: {
        fromId: string;
        toId: string;
    }[],
): Map<string, { x: number; y: number }> {
    const inputs: LayoutInput[] =
        nodes.map(n => ({
            id: n.mermaidId,
            isStart: n.isStart,
            isComplete: n.isComplete,
        }));
    const layoutEdges: LayoutEdge[] =
        edges.map(e => ({
            fromId: e.fromId,
            toId: e.toId,
        }));
    return computeLayout(
        inputs, layoutEdges,
        IMPORT_CANVAS_W, IMPORT_CANVAS_H,
    );
}

async function createFlowShell(
    flowId: string,
    projectId: string,
    name: string,
    description: string,
): Promise<void> {
    const now = nowUtc();
    await POST<void>('flows', {
        id: flowId,
        name,
        description,
        created_at: now,
        updated_at: now,
    });
    await POST<void>('project-flows', {
        id: crypto.randomUUID(),
        project_id: projectId,
        flow_id: flowId,
        created_at: now,
    });
}

async function createImportedNode(
    flowId: string,
    nodeId: string,
    name: string,
    description: string,
    x: number,
    y: number,
    isStart: boolean,
    isComplete: boolean,
): Promise<void> {
    const now = nowUtc();
    await POST<void>('wf-nodes', {
        id: nodeId,
        name,
        description,
        position_x: x,
        position_y: y,
        is_start: isStart ? 1 : 0,
        is_complete: isComplete ? 1 : 0,
        created_at: now,
    });
    await POST<void>('wf-flow-nodes', {
        id: crypto.randomUUID(),
        flow_id: flowId,
        node_id: nodeId,
        created_at: now,
    });
}

export async function importFlowFromMermaid(
    text: string,
    projectId: string,
): Promise<{
    flowId: string;
    warnings: string[];
}> {
    const parsed = parseMermaid(text);
    if (parsed.nodes.length === 0) {
        throw new Error(
            'No nodes found in Mermaid text',
        );
    }

    const flowId = crypto.randomUUID();
    const positions = layoutParsedNodes(
        parsed.nodes, parsed.edges,
    );

    const idMap =
        new Map<string, string>();
    for (const n of parsed.nodes) {
        idMap.set(
            n.mermaidId,
            crypto.randomUUID(),
        );
    }

    await createFlowShell(
        flowId, projectId,
        parsed.nodes[0]!.name
            + ' (import)',
        '',
    );

    for (const n of parsed.nodes) {
        const nodeId = idMap.get(
            n.mermaidId,
        )!;
        const pos = positions.get(
            n.mermaidId,
        );
        const x = pos?.x ?? 0;
        const y = pos?.y ?? 0;
        await createImportedNode(
            flowId, nodeId,
            n.name, '',
            x, y,
            n.isStart, n.isComplete,
        );
    }

    for (const e of parsed.edges) {
        const fromId =
            idMap.get(e.fromId);
        const toId = idMap.get(e.toId);
        if (!fromId || !toId) continue;
        await postEdgeConnection({
            edgeId: crypto.randomUUID(),
            nodeEdgeId:
                crypto.randomUUID(),
            name: e.name,
            fromNodeId: fromId,
            toNodeId: toId,
        });
    }

    return {
        flowId,
        warnings: parsed.warnings,
    };
}

interface SidecarData {
    version: number;
    name: string;
    description: string;
    nodes: SidecarNode[];
    edges: SidecarEdge[];
}

export async function importFlowFromZip(
    data: Uint8Array,
    projectId: string,
): Promise<{
    flowId: string;
    warnings: string[];
}> {
    const dec = new TextDecoder();
    const entries = await readZip(data);

    const mmdEntry = entries.find(
        e => e.name === 'flow.mmd'
            || e.name.endsWith(
                '/flow.mmd',
            ),
    );
    if (!mmdEntry) {
        throw new Error(
            'ZIP missing flow.mmd',
        );
    }
    const jsonEntry = entries.find(
        e => e.name === 'flow.json'
            || e.name.endsWith(
                '/flow.json',
            ),
    );

    const mmdText =
        dec.decode(mmdEntry.data);
    const parsed = parseMermaid(mmdText);
    if (parsed.nodes.length === 0) {
        throw new Error(
            'No nodes found in flow.mmd',
        );
    }

    const fallback =
        null as unknown as SidecarData;
    const sidecar: SidecarData | null =
        jsonEntry
            ? parseJson<SidecarData>(
                dec.decode(
                    jsonEntry.data,
                ),
                fallback,
            )
            : null;

    const sidecarNodeMap = new Map<
        string, SidecarNode
    >();
    if (sidecar) {
        for (const sn of sidecar.nodes) {
            sidecarNodeMap.set(
                sn.mermaidId, sn,
            );
        }
    }

    const sidecarEdgeKey = (
        from: string, to: string,
    ): string => from + '->' + to;

    const sidecarEdgeMap = new Map<
        string, SidecarEdge
    >();
    if (sidecar) {
        for (const se of sidecar.edges) {
            sidecarEdgeMap.set(
                sidecarEdgeKey(
                    se.mermaidFrom,
                    se.mermaidTo,
                ),
                se,
            );
        }
    }

    const positions = layoutParsedNodes(
        parsed.nodes, parsed.edges,
    );

    const flowId = crypto.randomUUID();
    const flowName = sidecar?.name
        ?? parsed.nodes[0]!.name
            + ' (import)';
    const flowDesc =
        sidecar?.description ?? '';

    await createFlowShell(
        flowId, projectId,
        flowName, flowDesc,
    );

    const idMap =
        new Map<string, string>();
    for (const n of parsed.nodes) {
        idMap.set(
            n.mermaidId,
            crypto.randomUUID(),
        );
    }

    for (const n of parsed.nodes) {
        const nodeId = idMap.get(
            n.mermaidId,
        )!;
        const sc = sidecarNodeMap.get(
            n.mermaidId,
        );
        const pos = sc
            ? { x: sc.positionX,
                y: sc.positionY }
            : positions.get(n.mermaidId);
        const x = pos?.x ?? 0;
        const y = pos?.y ?? 0;
        const desc =
            sc?.description ?? '';

        await createImportedNode(
            flowId, nodeId,
            n.name, desc,
            x, y,
            n.isStart, n.isComplete,
        );

        if (sc) {
            for (const f of sc.fields) {
                await postFieldAddition({
                    fieldId:
                        crypto.randomUUID(),
                    nodeFieldId:
                        crypto.randomUUID(),
                    nodeId,
                    name: f.name,
                    fieldType:
                        f.fieldType,
                    sortOrder:
                        f.sortOrder,
                    isRequired:
                        f.isRequired,
                    options: f.options,
                });
            }
        }
    }

    for (const e of parsed.edges) {
        const fromId =
            idMap.get(e.fromId);
        const toId = idMap.get(e.toId);
        if (!fromId || !toId) continue;
        const se = sidecarEdgeMap.get(
            sidecarEdgeKey(
                e.fromId, e.toId,
            ),
        );
        const edgeId =
            crypto.randomUUID();
        await postEdgeConnection({
            edgeId,
            nodeEdgeId:
                crypto.randomUUID(),
            name: e.name,
            fromNodeId: fromId,
            toNodeId: toId,
        });
        if (se?.description) {
            await putWfEdge(edgeId, {
                description:
                    se.description,
            });
        }
    }

    return {
        flowId,
        warnings: parsed.warnings,
    };
}
