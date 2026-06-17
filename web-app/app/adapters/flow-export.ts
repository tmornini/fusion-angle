import {
    nowUtc,
    storedGraph,
    storedGraphField,
    DEFAULT_LOCK_TIMEOUT,
    DEFAULT_NODE_MEMBER_IDS,
    DEFAULT_NODE_TASK_INSTRUCTIONS,
    projectStateIsNotDeleted,
} from '../../../api/types.ts';
import {
    getProjectStates,
} from './state-events.ts';
import type {
    FlowEntity,
    ProjectEntity,
    GraphNode,
    GraphEdge,
    StoredGraph,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from '../../../api/crypto-safe-base62.ts';
import {
    notifyFlowChange,
} from './flow-mutations.ts';
import {
    validateStoredGraphJson,
    parseOrThrow,
    asObject,
    asArray,
    asString,
    asNumber,
    asBoolean,
    asStoredGraph,
} from '../../../api/validators.ts';
import {
    getFlowGraph,
    getProjectFlowEntities,
} from './flow-queries.ts';
import type { FlowGraph } from './flow-queries.ts';
import type { RequestContext } from './shared.ts';
import {
    generateMermaid,
} from '../mermaid-generate.ts';
import { parseMermaid } from '../mermaid-parse.ts';
import type {
    ParsedNode,
    ParsedEdge,
} from '../mermaid-parse.ts';
import {
    DEFAULT_ZIP_LIMITS,
    buildZip, getZipEntries,
} from '../zip.ts';
import {
    buildStartAndCompleteNodes,
} from './flow-defaults.ts';
import type { LayoutInput } from '../flow-layout.ts';
import {
    runLayoutFromInputs,
} from '../flow-graph-layout.ts';

/* ── Mermaid export ──────────────── */

export async function getFlowMermaid(
    ctx: RequestContext,
    flowId: string,
): Promise<string> {
    const graph =
        await getFlowGraph(ctx, flowId);
    return generateMermaid(graph);
}

interface SidecarNode {
    mermaidId: string;
    name: string;
    positionX: number;
    positionY: number;
    isCreate: boolean;
    isArchive: boolean;
}

interface SidecarEdge {
    mermaidFrom: string;
    mermaidTo: string;
    name: string;
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
            positionX: n.positionX,
            positionY: n.positionY,
            isCreate: n.isCreate,
            isArchive: n.isArchive,
        }));
    const edges: SidecarEdge[] =
        graph.edges.map(e => ({
            mermaidFrom:
                sanitizeId(e.fromNodeId),
            mermaidTo:
                sanitizeId(e.toNodeId),
            name: e.name,
        }));
    return JSON.stringify({
        version: 1,
        name: graph.name,
        nodes,
        edges,
    }, null, 2);
}

// 'YYYY-MM-DDTHH:MM' — the ISO prefix through
// minute precision.
const ISO_MINUTE_WIDTH = 16;

function fileStamp(
    timeSep: string,
): string {
    const iso = new Date()
        .toISOString()
        .slice(0, ISO_MINUTE_WIDTH) + 'Z';
    return timeSep === ':'
        ? iso
        : iso.replaceAll(':', timeSep);
}

function buildFlowTxt(
    flowId: string,
): string {
    return 'flowId: ' + flowId + '\n'
        + 'exportedAt: '
        + nowUtc() + '\n';
}

/* ── backup format ──────────────── */

export interface Backup {
    exportedAt: string;
    projectId: string | undefined;
    flow: {
        id: string;
        name: string;
        isLocked: boolean;
        isAutoLayout: boolean;
        isAutoFit: boolean;
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
                '‘' + flowName
                + '’ already exists'
                + ' in ‘'
                + projectName + '’.',
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
                'Project ‘'
                + projectName
                + '’ found. ‘'
                + flowName
                + '’ will be'
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
                '‘' + flowName
                + '’ exists but its'
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
            'Neither ‘' + flowName
            + '’ nor its project'
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
    ctx: RequestContext,
    flowId: string,
): Promise<{
    flow: FlowEntity;
    projectId: string | undefined;
}> {
    const [flow, projectFlows] =
        await Promise.all([
            ctx.GET<FlowEntity>(
                'flows/' + flowId,
            ),
            getProjectFlowEntities(ctx),
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
    const graph = validateStoredGraphJson(
        flow.graph, 'flow.graph',
    );
    const backup: Backup = {
        exportedAt: nowUtc(),
        projectId,
        flow: {
            id: flow.id,
            name: flow.name,
            isLocked: asBoolean(
                flow.is_locked,
                'is_locked',
            ),
            isAutoLayout: asBoolean(
                flow.is_auto_layout,
                'is_auto_layout',
            ),
            isAutoFit: asBoolean(
                flow.is_auto_fit,
                'is_auto_fit',
            ),
            lockTimeout:
                flow.lock_timeout,
            graph,
        },
    };
    // The backup file speaks the storage tongue —
    // import re-parses it with asStoredGraph.
    return JSON.stringify({
        ...backup,
        flow: {
            ...backup.flow,
            graph: storedGraph(
                backup.flow.graph,
            ),
        },
    }, null, 2);
}

export async function getFlowZip(
    ctx: RequestContext,
    flowId: string,
): Promise<{
    data: Uint8Array;
    name: string;
}> {
    const { flow, projectId } =
        await getFlowBackupData(ctx, flowId);

    const graph = validateStoredGraphJson(
        flow.graph, 'flow.graph',
    );

    const mermaidGraph: FlowGraph = {
        id: flow.id,
        name: flow.name,
        isLocked: asBoolean(
            flow.is_locked,
            'is_locked',
        ),
        isAutoLayout: asBoolean(
            flow.is_auto_layout,
            'is_auto_layout',
        ),
        isAutoFit: asBoolean(
            flow.is_auto_fit,
            'is_auto_fit',
        ),
        lockTimeout: flow.lock_timeout,
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
    const sidecar = enc.encode(
        buildSidecar(mermaidGraph),
    );

    const data = buildZip([
        { name: 'flow.txt', data: txt },
        { name: 'flow.mmd', data: mmd },
        { name: 'flow.json', data: json },
        { name: 'sidecar.json', data: sidecar },
    ]);

    const safeName = flow.name
        .replaceAll(
            /[^a-zA-Z0-9_-]/g, '-',
        )
        .toLowerCase();

    return {
        data,
        name: safeName
            + '-' + fileStamp('-')
            + '.zip',
    };
}

/* ── import ───────────────── */

function validateBackupJson(
    raw: string,
): Backup {
    const label = 'backup';
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const flowObj = asObject(
        obj['flow'], label + '.flow',
    );
    const graphObj = asObject(
        flowObj['graph'],
        label + '.flow.graph',
    );
    const projectIdRaw = obj['projectId'];
    const projectId =
        projectIdRaw === undefined
            ? undefined
            : asString(
                projectIdRaw,
                label + '.projectId',
            );
    return {
        exportedAt: asString(
            obj['exportedAt'],
            label + '.exportedAt',
        ),
        projectId,
        flow: {
            id: asString(
                flowObj['id'],
                label + '.flow.id',
            ),
            name: asString(
                flowObj['name'],
                label + '.flow.name',
            ),
            isLocked:
                flowObj['isLocked']
                    === true,
            isAutoLayout:
                flowObj['isAutoLayout']
                    === true,
            isAutoFit:
                flowObj['isAutoFit']
                    === true,
            lockTimeout: asNumber(
                flowObj['lockTimeout'],
                label
                    + '.flow.lockTimeout',
            ),
            graph: asStoredGraph(
                graphObj,
                label + '.flow.graph',
            ),
        },
    };
}

export async function getBackupFromZip(
    data: Uint8Array,
): Promise<Backup> {
    const entries = await getZipEntries(
        data, DEFAULT_ZIP_LIMITS,
    );
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
    return validateBackupJson(text);
}

export async function computeFlowBackupResolution(
    ctx: RequestContext,
    backup: Backup,
): Promise<ImportResolution> {
    const [flows, projects, projectStates] =
        await Promise.all([
            ctx.GET<FlowEntity[]>('flows'),
            ctx.GET<ProjectEntity[]>(
                'projects',
            ),
            getProjectStates(ctx),
        ]);
    const flowExists = flows.some(
        f => f.id === backup.flow.id,
    );
    const project = backup.projectId
        ? projects.find(p => {
            if (p.id !== backup.projectId) {
                return false;
            }
            const s = projectStates.get(p.id);
            if (s === undefined) {
                throw new Error(
                    'Project has no state event: '
                    + p.id,
                );
            }
            return projectStateIsNotDeleted(s);
        })
        : undefined;

    return {
        dialog: buildDialogConfig(
            backup.flow.name,
            project?.title,
            flowExists,
        ),
    };
}

export async function postFlowFromBackup(
    ctx: RequestContext,
    flowId: string,
    backup: Backup,
    projectId: string,
): Promise<string> {
    const now = nowUtc();

    const idMap =
        new Map<string, string>();
    const nodes: GraphNode[] = [];
    for (
        const n
            of backup.flow.graph.nodes
    ) {
        const newId = generateCryptoSafeBase62();
        idMap.set(n.id, newId);
        nodes.push({
            id: newId,
            name: n.name,
            positionX: n.positionX,
            positionY: n.positionY,
            isCreate: n.isCreate,
            isArchive: n.isArchive,
            memberIds: n.memberIds,
            attributes: [],
            taskInstructions: n.taskInstructions,
        });
    }

    const edges: GraphEdge[] =
        backup.flow.graph.edges.map(e => {
            const fromNodeId =
                idMap.get(e.fromNodeId);
            const toNodeId =
                idMap.get(e.toNodeId);
            if (!fromNodeId || !toNodeId) {
                throw new Error(
                    'Edge references unknown'
                    + ' node: '
                    + e.fromNodeId
                    + ' -> '
                    + e.toNodeId,
                );
            }
            return {
                id: generateCryptoSafeBase62(),
                name: e.name,
                fromNodeId,
                toNodeId,
            };
        });

    const linkId = generateCryptoSafeBase62();
    await ctx.POST('flows', {
        id: flowId,
        flow: {
            name: backup.flow.name,
            is_locked: backup.flow.isLocked,
            is_auto_layout: backup.flow.isAutoLayout,
            is_auto_fit: backup.flow.isAutoFit,
            lock_timeout: backup.flow.lockTimeout,
            graph: storedGraphField({
                nodes, edges,
            }),
        },
        projectFlowId: linkId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: now,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
    });

    notifyFlowChange();
    return flowId;
}

/* ── Mermaid import ──────────────── */

const IMPORT_CANVAS_W = 1200;
const IMPORT_CANVAS_H = 800;

interface IntermediateParsed {
    parsed: ParsedNode;
    newId: string;
}

interface RemappedGraph {
    intermediates: IntermediateParsed[];
    idMap: Map<string, string>;
}

function remapParsedToDefaults(
    parsed: ParsedNode[],
    startId: string,
    completeId: string,
): RemappedGraph {
    const idMap = new Map<string, string>();
    const intermediates: IntermediateParsed[] =
        [];
    for (const n of parsed) {
        if (n.isCreate) {
            idMap.set(n.mermaidId, startId);
            continue;
        }
        if (n.isArchive) {
            idMap.set(
                n.mermaidId, completeId,
            );
            continue;
        }
        const newId = generateCryptoSafeBase62();
        idMap.set(n.mermaidId, newId);
        intermediates.push({
            parsed: n, newId,
        });
    }
    return { intermediates, idMap };
}

function layoutImportedGraph(
    startId: string,
    completeId: string,
    intermediates: IntermediateParsed[],
    edges: GraphEdge[],
): Map<string, { x: number; y: number }> {
    const inputs: LayoutInput[] = [
        {
            id: startId,
            isCreate: true,
            isArchive: false,
        },
        ...intermediates.map(
            ({ newId }) => ({
                id: newId,
                isCreate: false,
                isArchive: false,
            }),
        ),
        {
            id: completeId,
            isCreate: false,
            isArchive: true,
        },
    ];
    return runLayoutFromInputs(inputs, edges, {
        w: IMPORT_CANVAS_W,
        h: IMPORT_CANVAS_H,
    }).positions;
}

function buildImportedEdges(
    parsedEdges: ParsedEdge[],
    idMap: Map<string, string>,
): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const e of parsedEdges) {
        const fromId = idMap.get(e.fromId);
        const toId = idMap.get(e.toId);
        if (!fromId || !toId) {
            throw new Error(
                'Flow import: edge '
                + e.fromId + '->'
                + e.toId
                + ' references unknown'
                + ' node(s)',
            );
        }
        if (fromId === toId) continue;
        const key =
            fromId + '->'
            + toId + ':' + e.name;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
            id: generateCryptoSafeBase62(),
            name: e.name,
            fromNodeId: fromId,
            toNodeId: toId,
        });
    }
    return edges;
}

function autoWireDefaults(
    startId: string,
    completeId: string,
    intermediateIds: string[],
    edges: GraphEdge[],
    wireStart: boolean,
    wireEnd: boolean,
): GraphEdge[] {
    if (!wireStart && !wireEnd) return edges;
    const incoming = new Set(
        edges.map(e => e.toNodeId),
    );
    const outgoing = new Set(
        edges.map(e => e.fromNodeId),
    );
    const extras: GraphEdge[] = [];
    if (wireStart) {
        for (const id of intermediateIds) {
            if (!incoming.has(id)) {
                extras.push({
                    id: generateCryptoSafeBase62(),
                    name: '',
                    fromNodeId: startId,
                    toNodeId: id,
                });
            }
        }
    }
    if (wireEnd) {
        for (const id of intermediateIds) {
            if (!outgoing.has(id)) {
                extras.push({
                    id: generateCryptoSafeBase62(),
                    name: '',
                    fromNodeId: id,
                    toNodeId: completeId,
                });
            }
        }
    }
    return [...edges, ...extras];
}

export async function postFlowFromMermaid(
    ctx: RequestContext,
    flowId: string,
    text: string,
    projectId: string,
): Promise<{
    flowId: string;
    warnings: string[];
}> {
    const parsed = parseMermaid(text);
    if (
        parsed.nodes.length === 0
        && parsed.edges.length === 0
    ) {
        throw new Error(
            'No nodes or transitions found',
        );
    }

    const now = nowUtc();
    const { start, complete } =
        buildStartAndCompleteNodes();

    const { intermediates, idMap } =
        remapParsedToDefaults(
            parsed.nodes,
            start.id,
            complete.id,
        );

    const hasExplicitStart =
        parsed.nodes.some(n => n.isCreate);
    const hasExplicitComplete =
        parsed.nodes.some(n => n.isArchive);

    const intermediateIds = intermediates
        .map(({ newId }) => newId);
    const rewiredEdges = buildImportedEdges(
        parsed.edges, idMap,
    );
    const edges = autoWireDefaults(
        start.id,
        complete.id,
        intermediateIds,
        rewiredEdges,
        !hasExplicitStart,
        !hasExplicitComplete,
    );

    const positions = layoutImportedGraph(
        start.id,
        complete.id,
        intermediates,
        edges,
    );

    const startPos = positions.get(start.id);
    if (!startPos) {
        throw new Error(
            'layout missing position for'
                + ' start node',
        );
    }
    start.positionX = startPos.x;
    start.positionY = startPos.y;
    const completePos =
        positions.get(complete.id);
    if (!completePos) {
        throw new Error(
            'layout missing position for'
                + ' complete node',
        );
    }
    complete.positionX = completePos.x;
    complete.positionY = completePos.y;

    const intermediateNodes: GraphNode[] =
        intermediates.map(
            ({ parsed: p, newId }) => {
                const pos = positions.get(
                    newId,
                );
                if (!pos) {
                    throw new Error(
                        'layout missing'
                        + ' position for '
                        + newId,
                    );
                }
                return {
                    id: newId,
                    name: p.name,
                    positionX: pos.x,
                    positionY: pos.y,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [
                        ...DEFAULT_NODE_MEMBER_IDS,
                    ],
                    attributes: [],
                    taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
                };
            },
        );

    const graph: StoredGraph = {
        nodes: [
            start,
            ...intermediateNodes,
            complete,
        ],
        edges,
    };

    const firstNode = intermediateNodes[0];
    if (!firstNode) {
        throw new Error(
            'Mermaid import requires'
                + ' at least one'
                + ' intermediate state',
        );
    }
    const linkId = generateCryptoSafeBase62();
    await ctx.POST('flows', {
        id: flowId,
        flow: {
            name: firstNode.name + ' (import)',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: storedGraphField(graph),
        },
        projectFlowId: linkId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: now,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
    });

    notifyFlowChange();
    return {
        flowId,
        warnings: parsed.warnings,
    };
}

interface SidecarData {
    version: number;
    name: string;
    nodes: SidecarNode[];
    edges: SidecarEdge[];
}

function asSidecarNode(
    value: unknown,
    label: string,
): SidecarNode {
    const obj = asObject(value, label);
    return {
        mermaidId: asString(
            obj['mermaidId'],
            label + '.mermaidId',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        positionX: asNumber(
            obj['positionX'],
            label + '.positionX',
        ),
        positionY: asNumber(
            obj['positionY'],
            label + '.positionY',
        ),
        isCreate: asBoolean(
            obj['isCreate'],
            label + '.isCreate',
        ),
        isArchive: asBoolean(
            obj['isArchive'],
            label + '.isArchive',
        ),
    };
}

function asSidecarEdge(
    value: unknown,
    label: string,
): SidecarEdge {
    const obj = asObject(value, label);
    return {
        mermaidFrom: asString(
            obj['mermaidFrom'],
            label + '.mermaidFrom',
        ),
        mermaidTo: asString(
            obj['mermaidTo'],
            label + '.mermaidTo',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
    };
}

function validateSidecarDataJson(
    raw: string,
): SidecarData {
    const label = 'sidecar';
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const nodesArr = asArray(
        obj['nodes'], label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'], label + '.edges',
    );
    return {
        version: asNumber(
            obj['version'],
            label + '.version',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        nodes: nodesArr.map((n, i) =>
            asSidecarNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asSidecarEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

function applySidecarToDefault(
    node: GraphNode,
    sc: SidecarNode | undefined,
): void {
    if (!sc) return;
    node.name = sc.name;
    node.positionX = sc.positionX;
    node.positionY = sc.positionY;
}

export async function postFlowFromZip(
    ctx: RequestContext,
    flowId: string,
    data: Uint8Array,
    projectId: string,
): Promise<{
    flowId: string;
    warnings: string[];
}> {
    const dec = new TextDecoder();
    const entries = await getZipEntries(
        data, DEFAULT_ZIP_LIMITS,
    );

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
    if (
        parsed.nodes.length === 0
        && parsed.edges.length === 0
    ) {
        throw new Error(
            'No nodes or transitions found',
        );
    }

    const sidecar: SidecarData | undefined =
        jsonEntry
            ? validateSidecarDataJson(
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

    const { start, complete } =
        buildStartAndCompleteNodes();

    const { intermediates, idMap } =
        remapParsedToDefaults(
            parsed.nodes,
            start.id,
            complete.id,
        );

    const sidecarStart = sidecar?.nodes.find(
        n => n.isCreate,
    );
    const sidecarComplete =
        sidecar?.nodes.find(
            n => n.isArchive,
        );
    applySidecarToDefault(
        start, sidecarStart,
    );
    applySidecarToDefault(
        complete, sidecarComplete,
    );

    const hasExplicitStart =
        parsed.nodes.some(n => n.isCreate);
    const hasExplicitComplete =
        parsed.nodes.some(n => n.isArchive);

    const intermediateIds = intermediates
        .map(({ newId }) => newId);
    const rewiredEdges = buildImportedEdges(
        parsed.edges,
        idMap,
    );
    const edges = autoWireDefaults(
        start.id,
        complete.id,
        intermediateIds,
        rewiredEdges,
        !hasExplicitStart,
        !hasExplicitComplete,
    );

    const positions = sidecar
        ? new Map<
            string, { x: number; y: number }
        >()
        : layoutImportedGraph(
            start.id,
            complete.id,
            intermediates,
            edges,
        );

    if (!sidecar) {
        const sp = positions.get(start.id);
        if (!sp) {
            throw new Error(
                'layout missing position'
                    + ' for start node',
            );
        }
        start.positionX = sp.x;
        start.positionY = sp.y;
        const cp = positions.get(
            complete.id,
        );
        if (!cp) {
            throw new Error(
                'layout missing position'
                    + ' for complete node',
            );
        }
        complete.positionX = cp.x;
        complete.positionY = cp.y;
    }

    const intermediateNodes: GraphNode[] =
        intermediates.map(
            ({ parsed: p, newId }) => {
                const sc = sidecarNodeMap.get(
                    p.mermaidId,
                );
                const pos = sc
                    ? {
                        x: sc.positionX,
                        y: sc.positionY,
                    }
                    : positions.get(newId);
                if (!pos) {
                    throw new Error(
                        'layout missing'
                        + ' position for '
                        + newId,
                    );
                }
                return {
                    id: newId,
                    name: sc
                        ? sc.name
                        : p.name,
                    positionX: pos.x,
                    positionY: pos.y,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [
                        ...DEFAULT_NODE_MEMBER_IDS,
                    ],
                    attributes: [],
                    taskInstructions: DEFAULT_NODE_TASK_INSTRUCTIONS,
                };
            },
        );

    const graph: StoredGraph = {
        nodes: [
            start,
            ...intermediateNodes,
            complete,
        ],
        edges,
    };

    const now = nowUtc();
    const firstNode = intermediateNodes[0];
    if (!sidecar && !firstNode) {
        throw new Error(
            'ZIP import requires a'
                + ' sidecar or at least'
                + ' one intermediate'
                + ' state',
        );
    }
    const flowName = sidecar
        ? sidecar.name
        : firstNode!.name + ' (import)';

    const linkId = generateCryptoSafeBase62();
    await ctx.POST('flows', {
        id: flowId,
        flow: {
            name: flowName,
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: storedGraphField(graph),
        },
        projectFlowId: linkId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: now,
        },
        initialState: 'active',
        initialStateEventId: generateCryptoSafeBase62(),
    });

    notifyFlowChange();
    return {
        flowId,
        warnings: parsed.warnings,
    };
}
