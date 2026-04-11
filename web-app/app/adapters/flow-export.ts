import {
    GET, POST, PUT,
} from '../../../api/api';
import {
    nowUtc,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    toBool,
    projectIsNotDeleted,
} from '../../../api/types';
import type {
    FlowEntity,
    ProjectFlowEntity,
    ProjectEntity,
    GraphNode,
    GraphEdge,
    WfFieldType,
} from '../../../api/types';
import { parseJson } from './helpers';
import {
    getFlowGraph,
} from './flow-queries';
import type { FlowGraph } from './flow-queries';
import {
    generateMermaid,
} from '../mermaid-generate';
import { parseMermaid } from '../mermaid-parse';
import type {
    ParsedNode,
} from '../mermaid-parse';
import {
    buildZip, getZipEntries,
} from '../zip';
import {
    computeLayout,
} from '../flow-layout';
import type {
    LayoutInput, LayoutEdge,
} from '../flow-layout';

/* ── Mermaid export ──────────────── */

export async function getFlowMermaid(
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

/* ── v2 backup format ───────────── */

export interface BackupV2 {
    version: 2;
    exportedAt: string;
    projectId: string | undefined;
    flow: {
        id: string;
        name: string;
        description: string;
        lockTimeout: number;
        graph: {
            nodes: GraphNode[];
            edges: GraphEdge[];
        };
    };
}

export interface ImportDialogConfig {
    description: string;
    showProject: boolean;
    showOverwrite: boolean;
    showCreateNew: boolean;
    showCreate: boolean;
    hasKnownProject: boolean;
}

export interface ImportResolution {
    dialog: ImportDialogConfig;
}

function buildDialogConfig(
    flowName: string,
    projectName: string | undefined,
    flowExists: boolean,
): ImportDialogConfig {
    if (projectName && flowExists) {
        return {
            description:
                '\u2018' + flowName
                + '\u2019 already exists'
                + ' in \u2018'
                + projectName + '\u2019.',
            showProject: false,
            showOverwrite: true,
            showCreateNew: true,
            showCreate: false,
            hasKnownProject: true,
        };
    }
    if (projectName) {
        return {
            description:
                'Project \u2018'
                + projectName
                + '\u2019 found. \u2018'
                + flowName
                + '\u2019 will be'
                + ' created.',
            showProject: false,
            showOverwrite: false,
            showCreateNew: true,
            showCreate: false,
            hasKnownProject: true,
        };
    }
    if (flowExists) {
        return {
            description:
                '\u2018' + flowName
                + '\u2019 exists but its'
                + ' project does not.',
            showProject: false,
            showOverwrite: true,
            showCreateNew: false,
            showCreate: false,
            hasKnownProject: false,
        };
    }
    return {
        description:
            'Neither \u2018' + flowName
            + '\u2019 nor its project'
            + ' exist. Select a'
            + ' project.',
        showProject: true,
        showOverwrite: false,
        showCreateNew: false,
        showCreate: true,
        hasKnownProject: false,
    };
}

async function getFlowBackupData(
    flowId: string,
): Promise<{
    flow: FlowEntity;
    projectId: string | undefined;
}> {
    const [flow, projectFlows] =
        await Promise.all([
            GET<FlowEntity>(
                'flows/' + flowId,
            ),
            GET<ProjectFlowEntity[]>(
                'project-flows',
            ),
        ]);
    const pf = projectFlows.find(
        r => r.flow_id === flowId,
    );
    return {
        flow,
        projectId: pf?.project_id,
    };
}

function buildBackupJson(
    flow: FlowEntity,
    projectId: string | undefined,
): string {
    const graph = parseJson<{
        nodes: GraphNode[];
        edges: GraphEdge[];
    }>(flow.graph);
    const backup: BackupV2 = {
        version: 2,
        exportedAt: minuteUtc(':'),
        projectId,
        flow: {
            id: flow.id,
            name: flow.name,
            description:
                flow.description,
            lockTimeout:
                flow.lock_timeout,
            graph,
        },
    };
    return JSON.stringify(
        backup, null, 2,
    );
}

export async function getFlowZip(
    flowId: string,
): Promise<{
    data: Uint8Array;
    name: string;
}> {
    const { flow, projectId } =
        await getFlowBackupData(flowId);

    const graph = parseJson<{
        nodes: GraphNode[];
        edges: GraphEdge[];
    }>(flow.graph);

    const mermaidGraph: FlowGraph = {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        isLocked: toBool(
            flow.is_locked,
        ),
        nodes: graph.nodes,
        edges: graph.edges,
    };

    const enc = new TextEncoder();
    const mmd = enc.encode(
        generateMermaid(mermaidGraph),
    );
    const json = enc.encode(
        buildBackupJson(flow, projectId),
    );
    const txt = enc.encode(
        buildFlowTxt(flowId),
    );

    const data = buildZip([
        { name: 'flow.txt', data: txt },
        { name: 'flow.mmd', data: mmd },
        { name: 'flow.json', data: json },
    ]);

    const safeName = flow.name
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

/* ── v2 import ───────────────── */

export async function getZipBackup(
    data: Uint8Array,
): Promise<BackupV2> {
    const entries = await getZipEntries(data);
    const jsonEntry = entries.find(
        e => e.name === 'flow.json'
            || e.name.endsWith(
                '/flow.json',
            ),
    );
    if (!jsonEntry) {
        throw new Error(
            'ZIP missing flow.json',
        );
    }
    const dec = new TextDecoder();
    const text =
        dec.decode(jsonEntry.data);
    const parsed = JSON.parse(text) as {
        version?: unknown;
    };
    if (parsed.version !== 2) {
        throw new Error(
            'Unsupported backup version: '
            + String(parsed.version),
        );
    }
    return parsed as
        unknown as BackupV2;
}

export async function getFlowBackupResolution(
    backup: BackupV2,
): Promise<ImportResolution> {
    const [flows, projects] =
        await Promise.all([
            GET<FlowEntity[]>('flows'),
            GET<ProjectEntity[]>(
                'projects',
            ),
        ]);
    const flowExists = flows.some(
        f => f.id === backup.flow.id,
    );
    const project = backup.projectId
        ? projects.find(
            p => p.id
                === backup.projectId
                && projectIsNotDeleted(
                    p,
                ),
        )
        : undefined;

    return {
        dialog: buildDialogConfig(
            backup.flow.name,
            project?.title,
            flowExists,
        ),
    };
}

export async function overwriteFlow(
    backup: BackupV2,
): Promise<string> {
    await PUT(
        'flows/' + backup.flow.id,
        {
            name: backup.flow.name,
            description:
                backup.flow.description,
            lock_timeout:
                backup.flow.lockTimeout,
            graph: putFlowGraph(
                backup.flow.graph,
            ),
            updated_at: nowUtc(),
        },
    );
    return backup.flow.id;
}

export async function postFlowFromBackup(
    backup: BackupV2,
    projectId: string,
): Promise<string> {
    const flowId = crypto.randomUUID();
    const now = nowUtc();

    const idMap =
        new Map<string, string>();
    for (
        const n
            of backup.flow.graph.nodes
    ) {
        idMap.set(
            n.id,
            crypto.randomUUID(),
        );
    }

    const nodes: GraphNode[] =
        backup.flow.graph.nodes.map(
            n => ({
                id: idMap.get(n.id)!,
                name: n.name,
                description:
                    n.description,
                positionX: n.positionX,
                positionY: n.positionY,
                isStart: n.isStart,
                isComplete: n.isComplete,
                fields: n.fields.map(
                    f => ({
                        id: crypto
                            .randomUUID(),
                        name: f.name,
                        fieldType:
                            f.fieldType,
                        sortOrder:
                            f.sortOrder,
                        isRequired:
                            f.isRequired,
                        options:
                            f.options,
                    }),
                ),
            }),
        );

    const edges: GraphEdge[] =
        backup.flow.graph.edges.map(
            e => ({
                id: crypto.randomUUID(),
                name: e.name,
                description:
                    e.description,
                fromNodeId:
                    idMap.get(
                        e.fromNodeId,
                    )!,
                toNodeId:
                    idMap.get(
                        e.toNodeId,
                    )!,
            }),
        );

    await POST<void>('flows', {
        id: flowId,
        name: backup.flow.name,
        description:
            backup.flow.description,
        lock_timeout:
            backup.flow.lockTimeout,
        graph: putFlowGraph({
            nodes, edges,
        }),
        created_at: now,
        updated_at: now,
    });

    await POST<void>(
        'project-flows',
        {
            id: crypto.randomUUID(),
            project_id: projectId,
            flow_id: flowId,
            created_at: now,
        },
    );

    return flowId;
}

/* ── Mermaid import ──────────────── */

const IMPORT_CANVAS_W = 1200;
const IMPORT_CANVAS_H = 800;
const IMPORT_DEFAULT_DESCRIPTION = '';
const IMPORT_FALLBACK_POSITION = 0;

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

interface StoredGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

function putFlowGraph(
    graph: StoredGraph,
): string {
    return jsonObjectField(
        graph as unknown as Record<
            string, unknown
        >,
    );
}

export async function postFlowFromMermaid(
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
    const now = nowUtc();
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

    const nodes: GraphNode[] =
        parsed.nodes.map(n => {
            const nodeId = idMap.get(
                n.mermaidId,
            )!;
            const pos = positions.get(
                n.mermaidId,
            );
            return {
                id: nodeId,
                name: n.name,
                description:
                    IMPORT_DEFAULT_DESCRIPTION,
                positionX: pos?.x
                    ?? IMPORT_FALLBACK_POSITION,
                positionY: pos?.y
                    ?? IMPORT_FALLBACK_POSITION,
                isStart: n.isStart,
                isComplete: n.isComplete,
                fields: [],
            };
        });

    const edges: GraphEdge[] = [];
    for (const e of parsed.edges) {
        const fromId =
            idMap.get(e.fromId);
        const toId = idMap.get(e.toId);
        if (!fromId || !toId) continue;
        edges.push({
            id: crypto.randomUUID(),
            name: e.name,
            description:
                IMPORT_DEFAULT_DESCRIPTION,
            fromNodeId: fromId,
            toNodeId: toId,
        });
    }

    const graph: StoredGraph = {
        nodes, edges,
    };

    await POST<void>('flows', {
        id: flowId,
        name: parsed.nodes[0]!.name
            + ' (import)',
        description: '',
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: putFlowGraph(graph),
        created_at: now,
        updated_at: now,
    });

    await POST<void>('project-flows', {
        id: crypto.randomUUID(),
        project_id: projectId,
        flow_id: flowId,
        created_at: now,
    });

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

export async function postFlowFromZip(
    data: Uint8Array,
    projectId: string,
): Promise<{
    flowId: string;
    warnings: string[];
}> {
    const dec = new TextDecoder();
    const entries = await getZipEntries(data);

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

    const sidecar: SidecarData | undefined =
        jsonEntry
            ? parseJson<SidecarData>(
                dec.decode(
                    jsonEntry.data,
                ),
            )
            : undefined;

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
    const now = nowUtc();
    const flowName = sidecar?.name
        ?? parsed.nodes[0]!.name
            + ' (import)';
    const flowDesc =
        sidecar?.description
        ?? IMPORT_DEFAULT_DESCRIPTION;

    const idMap =
        new Map<string, string>();
    for (const n of parsed.nodes) {
        idMap.set(
            n.mermaidId,
            crypto.randomUUID(),
        );
    }

    const nodes: GraphNode[] =
        parsed.nodes.map(n => {
            const nodeId = idMap.get(
                n.mermaidId,
            )!;
            const sc = sidecarNodeMap.get(
                n.mermaidId,
            );
            const pos = sc
                ? {
                    x: sc.positionX,
                    y: sc.positionY,
                }
                : positions.get(
                    n.mermaidId,
                );
            return {
                id: nodeId,
                name: n.name,
                description:
                    sc?.description
                    ?? IMPORT_DEFAULT_DESCRIPTION,
                positionX: pos?.x
                    ?? IMPORT_FALLBACK_POSITION,
                positionY: pos?.y
                    ?? IMPORT_FALLBACK_POSITION,
                isStart: n.isStart,
                isComplete: n.isComplete,
                fields: sc
                    ? sc.fields.map(f => {
                        const ft =
                            f.fieldType as
                                WfFieldType;
                        return {
                            id: crypto
                                .randomUUID(),
                            name: f.name,
                            fieldType: ft,
                            sortOrder:
                                f.sortOrder,
                            isRequired:
                                f.isRequired,
                            options:
                                f.options,
                        };
                    })
                    : [],
            };
        });

    const edges: GraphEdge[] = [];
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
        edges.push({
            id: crypto.randomUUID(),
            name: e.name,
            description:
                se?.description
                ?? IMPORT_DEFAULT_DESCRIPTION,
            fromNodeId: fromId,
            toNodeId: toId,
        });
    }

    const graph: StoredGraph = {
        nodes, edges,
    };

    await POST<void>('flows', {
        id: flowId,
        name: flowName,
        description: flowDesc,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: putFlowGraph(graph),
        created_at: now,
        updated_at: now,
    });

    await POST<void>('project-flows', {
        id: crypto.randomUUID(),
        project_id: projectId,
        flow_id: flowId,
        created_at: now,
    });

    return {
        flowId,
        warnings: parsed.warnings,
    };
}
