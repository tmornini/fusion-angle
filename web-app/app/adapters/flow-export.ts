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
    GraphField,
    StoredGraph,
    WfFieldType,
} from '../../../api/types';
import {
    validateStoredGraphJson,
    parseOrThrow,
    asObject,
    asArray,
    asString,
    asNumber,
    asBoolean,
    asStoredGraph,
    asWfFieldType,
} from '../../../api/validators';
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
    ParsedEdge,
} from '../mermaid-parse';
import {
    buildZip, getZipEntries,
} from '../zip';
import {
    buildDefaultStartEnd,
} from './flow-mutations';
import {
    computeLayout,
} from '../flow-layout';
import type {
    LayoutInput, LayoutEdge,
} from '../flow-layout';
import {
    computeEdgeLabelWidth,
} from '../flow-graph';

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
    fieldType: WfFieldType;
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
    const graph = validateStoredGraphJson(
        flow.graph, 'flow.graph',
    );
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

    const graph = validateStoredGraphJson(
        flow.graph, 'flow.graph',
    );

    const mermaidGraph: FlowGraph = {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        isLocked: toBool(
            flow.is_locked,
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

function validateBackupV2Json(
    raw: string,
): BackupV2 {
    const label = 'backup';
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const version = obj['version'];
    if (version !== 2) {
        throw new Error(
            'unsupported backup version '
                + 'for ' + label + ', got '
                + String(version),
        );
    }
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
        version: 2,
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
            description: asString(
                flowObj['description'],
                label
                    + '.flow.description',
            ),
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
    return validateBackupV2Json(text);
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

export async function putFlowFromBackup(
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
        if (n.isStart) {
            idMap.set(n.mermaidId, startId);
            continue;
        }
        if (n.isComplete) {
            idMap.set(
                n.mermaidId, completeId,
            );
            continue;
        }
        const newId = crypto.randomUUID();
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
            isStart: true,
            isComplete: false,
        },
        ...intermediates.map(
            ({ newId }) => ({
                id: newId,
                isStart: false,
                isComplete: false,
            }),
        ),
        {
            id: completeId,
            isStart: false,
            isComplete: true,
        },
    ];
    const layoutEdges: LayoutEdge[] =
        edges.map(e => ({
            fromId: e.fromNodeId,
            toId: e.toNodeId,
            labelWidth:
                e.fromNodeId === startId
                    ? 0
                    : computeEdgeLabelWidth(
                        e.name,
                    ),
        }));
    return computeLayout(
        inputs, layoutEdges,
        IMPORT_CANVAS_W, IMPORT_CANVAS_H,
    );
}

function buildImportedEdges(
    parsedEdges: ParsedEdge[],
    idMap: Map<string, string>,
    sidecarEdgeMap?: Map<
        string, SidecarEdge
    >,
): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const e of parsedEdges) {
        const fromId = idMap.get(e.fromId);
        const toId = idMap.get(e.toId);
        if (!fromId || !toId) continue;
        if (fromId === toId) continue;
        const key =
            fromId + '->'
            + toId + ':' + e.name;
        if (seen.has(key)) continue;
        seen.add(key);
        const sc = sidecarEdgeMap?.get(
            e.fromId + '->' + e.toId,
        );
        edges.push({
            id: crypto.randomUUID(),
            name: e.name,
            description: sc
                ? sc.description
                : '',
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
                    id: crypto.randomUUID(),
                    name: '',
                    description: '',
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
                    id: crypto.randomUUID(),
                    name: '',
                    description: '',
                    fromNodeId: id,
                    toNodeId: completeId,
                });
            }
        }
    }
    return [...edges, ...extras];
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
    if (
        parsed.nodes.length === 0
        && parsed.edges.length === 0
    ) {
        throw new Error(
            'No nodes or transitions found',
        );
    }

    const flowId = crypto.randomUUID();
    const now = nowUtc();
    const { start, complete } =
        buildDefaultStartEnd();

    const { intermediates, idMap } =
        remapParsedToDefaults(
            parsed.nodes,
            start.id,
            complete.id,
        );

    const hasExplicitStart =
        parsed.nodes.some(n => n.isStart);
    const hasExplicitComplete =
        parsed.nodes.some(n => n.isComplete);

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
                    description: p.name,
                    positionX: pos.x,
                    positionY: pos.y,
                    isStart: false,
                    isComplete: false,
                    fields: [],
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
    await POST<void>('flows', {
        id: flowId,
        name:
            firstNode.name + ' (import)',
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

function asSidecarField(
    value: unknown,
    label: string,
): SidecarField {
    const obj = asObject(value, label);
    const optsArr = asArray(
        obj['options'],
        label + '.options',
    );
    return {
        name: asString(
            obj['name'], label + '.name',
        ),
        fieldType: asWfFieldType(
            obj['fieldType'],
            label + '.fieldType',
        ),
        sortOrder: asNumber(
            obj['sortOrder'],
            label + '.sortOrder',
        ),
        isRequired: asBoolean(
            obj['isRequired'],
            label + '.isRequired',
        ),
        options: optsArr.map((o, i) =>
            asString(
                o,
                label + '.options['
                    + i + ']',
            ),
        ),
    };
}

function asSidecarNode(
    value: unknown,
    label: string,
): SidecarNode {
    const obj = asObject(value, label);
    const fieldsArr = asArray(
        obj['fields'], label + '.fields',
    );
    return {
        mermaidId: asString(
            obj['mermaidId'],
            label + '.mermaidId',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        positionX: asNumber(
            obj['positionX'],
            label + '.positionX',
        ),
        positionY: asNumber(
            obj['positionY'],
            label + '.positionY',
        ),
        isStart: asBoolean(
            obj['isStart'],
            label + '.isStart',
        ),
        isComplete: asBoolean(
            obj['isComplete'],
            label + '.isComplete',
        ),
        fields: fieldsArr.map((f, i) =>
            asSidecarField(
                f,
                label + '.fields['
                    + i + ']',
            ),
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
        description: asString(
            obj['description'],
            label + '.description',
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
        description: asString(
            obj['description'],
            label + '.description',
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

function sidecarFieldsToGraph(
    sc: SidecarNode,
): GraphField[] {
    return sc.fields.map(f => ({
        id: crypto.randomUUID(),
        name: f.name,
        fieldType: f.fieldType,
        sortOrder: f.sortOrder,
        isRequired: f.isRequired,
        options: f.options,
    }));
}

function applySidecarToDefault(
    node: GraphNode,
    sc: SidecarNode | undefined,
): void {
    if (!sc) return;
    node.name = sc.name;
    node.description = sc.description;
    node.positionX = sc.positionX;
    node.positionY = sc.positionY;
    node.fields = sidecarFieldsToGraph(sc);
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

    const { start, complete } =
        buildDefaultStartEnd();

    const { intermediates, idMap } =
        remapParsedToDefaults(
            parsed.nodes,
            start.id,
            complete.id,
        );

    const sidecarStart = sidecar?.nodes.find(
        n => n.isStart,
    );
    const sidecarComplete =
        sidecar?.nodes.find(
            n => n.isComplete,
        );
    applySidecarToDefault(
        start, sidecarStart,
    );
    applySidecarToDefault(
        complete, sidecarComplete,
    );

    const hasExplicitStart =
        parsed.nodes.some(n => n.isStart);
    const hasExplicitComplete =
        parsed.nodes.some(n => n.isComplete);

    const intermediateIds = intermediates
        .map(({ newId }) => newId);
    const rewiredEdges = buildImportedEdges(
        parsed.edges,
        idMap,
        sidecarEdgeMap,
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
                    description: sc
                        ? sc.description
                        : p.name,
                    positionX: pos.x,
                    positionY: pos.y,
                    isStart: false,
                    isComplete: false,
                    fields: sc
                        ? sidecarFieldsToGraph(
                            sc,
                        )
                        : [],
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

    const flowId = crypto.randomUUID();
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
    const flowDesc = sidecar
        ? sidecar.description
        : firstNode!.name;

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
