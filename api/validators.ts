import type {
    GraphNode,
    GraphEdge,
    GraphField,
    StoredGraph,
    WorkOrderFlowGraph,
    FlowFieldType,
} from './types';

export interface Risk {
    title: string;
    severity: string;
    mitigation: string;
}

const FLOW_FIELD_TYPE_VALUES:
    readonly FlowFieldType[] = [
        'text', 'textarea', 'number',
        'date', 'select', 'checkbox',
        'file', 'email', 'url', 'phone',
        'currency', 'multi_select',
        'radio', 'image',
    ];

export function parseOrThrow(
    raw: string,
    label: string,
): unknown {
    try {
        return JSON.parse(raw);
    } catch (e) {
        const msg = e instanceof Error
            ? e.message
            : String(e);
        throw new Error(
            'invalid JSON for '
                + label + ': ' + msg,
        );
    }
}

export function asArray(
    value: unknown,
    label: string,
): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(
            'expected array for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asObject(
    value: unknown,
    label: string,
): Record<string, unknown> {
    if (
        typeof value !== 'object'
        || value === null
        || Array.isArray(value)
    ) {
        throw new Error(
            'expected object for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value as Record<string, unknown>;
}

export function asString(
    value: unknown,
    label: string,
): string {
    if (typeof value !== 'string') {
        throw new Error(
            'expected string for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asNumber(
    value: unknown,
    label: string,
): number {
    if (
        typeof value !== 'number'
        || !Number.isFinite(value)
    ) {
        throw new Error(
            'expected finite number for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asBoolean(
    value: unknown,
    label: string,
): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(
            'expected boolean for '
                + label
                + ', got '
                + typeName(value),
        );
    }
    return value;
}

export function asFlowFieldType(
    value: unknown,
    label: string,
): FlowFieldType {
    const str = asString(value, label);
    if (
        !(FLOW_FIELD_TYPE_VALUES as
            readonly string[]).includes(str)
    ) {
        throw new Error(
            'expected FlowFieldType for '
                + label + ', got ' + str,
        );
    }
    return str as FlowFieldType;
}

function typeName(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

export function validateStringArrayJson(
    raw: string,
    label: string,
): string[] {
    const parsed = parseOrThrow(raw, label);
    const arr = asArray(parsed, label);
    return arr.map((item, i) =>
        asString(
            item,
            label + '[' + i + ']',
        ),
    );
}

export function
validateStringNumberRecordJson(
    raw: string,
    label: string,
): Record<string, number> {
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const out: Record<string, number> = {};
    for (
        const [k, v] of Object.entries(obj)
    ) {
        out[k] = asNumber(
            v, label + '.' + k,
        );
    }
    return out;
}

export function validateRisksJson(
    raw: string,
): Risk[] {
    const label = 'risks';
    const parsed = parseOrThrow(raw, label);
    const arr = asArray(parsed, label);
    return arr.map((item, i) => {
        const itemLabel =
            label + '[' + i + ']';
        const obj = asObject(
            item, itemLabel,
        );
        return {
            title: asString(
                obj['title'],
                itemLabel + '.title',
            ),
            severity: asString(
                obj['severity'],
                itemLabel + '.severity',
            ),
            mitigation: asString(
                obj['mitigation'],
                itemLabel + '.mitigation',
            ),
        };
    });
}

function asGraphField(
    value: unknown,
    label: string,
): GraphField {
    const obj = asObject(value, label);
    const optsArr = asArray(
        obj['options'],
        label + '.options',
    );
    return {
        id: asString(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        fieldType: asFlowFieldType(
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

function asGraphNode(
    value: unknown,
    label: string,
): GraphNode {
    const obj = asObject(value, label);
    const fieldsArr = asArray(
        obj['fields'],
        label + '.fields',
    );
    return {
        id: asString(
            obj['id'], label + '.id',
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
            asGraphField(
                f,
                label + '.fields['
                    + i + ']',
            ),
        ),
    };
}

function asGraphEdge(
    value: unknown,
    label: string,
): GraphEdge {
    const obj = asObject(value, label);
    return {
        id: asString(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        fromNodeId: asString(
            obj['fromNodeId'],
            label + '.fromNodeId',
        ),
        toNodeId: asString(
            obj['toNodeId'],
            label + '.toNodeId',
        ),
    };
}

export function asStoredGraph(
    value: unknown,
    label: string,
): StoredGraph {
    const obj = asObject(value, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

export function validateStoredGraphJson(
    raw: string,
    label: string,
): StoredGraph {
    const parsed = parseOrThrow(raw, label);
    return asStoredGraph(parsed, label);
}

export function
validateWorkOrderFlowGraphJson(
    raw: string,
    label: string,
): WorkOrderFlowGraph {
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        flowId: asString(
            obj['flowId'],
            label + '.flowId',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        description: asString(
            obj['description'],
            label + '.description',
        ),
        lockTimeout: asNumber(
            obj['lockTimeout'],
            label + '.lockTimeout',
        ),
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

export function
validateTransitionValuesJson(
    raw: string,
    label: string,
): Record<string, string> {
    const parsed = parseOrThrow(raw, label);
    const obj = asObject(parsed, label);
    const out: Record<string, string> = {};
    for (
        const [k, v] of Object.entries(obj)
    ) {
        out[k] = asString(
            v, label + '.' + k,
        );
    }
    return out;
}
