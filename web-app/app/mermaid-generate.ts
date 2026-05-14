import type {
    FlowGraph,
    GraphNode,
} from './adapters/flows.ts';

const MERMAID_SPECIAL = /[\[\](){}|>]/;

function sanitizeId(id: string): string {
    return id.replaceAll('-', '_');
}

function quoteLabel(name: string): string {
    if (MERMAID_SPECIAL.test(name)) {
        const escaped =
            name.replaceAll('"', '&quot;');
        return '"' + escaped + '"';
    }
    return name;
}

function buildNodeLine(
    node: GraphNode,
): string {
    const id = sanitizeId(node.id);
    const label = quoteLabel(node.name);
    if (node.isCreate) {
        return '  ' + id
            + '([' + label + '])';
    }
    if (node.isArchive) {
        return '  ' + id
            + '(((' + label + ')))';
    }
    return '  ' + id
        + '[' + label + ']';
}

export function generateMermaid(
    graph: FlowGraph,
): string {
    const lines: string[] = [
        'flowchart LR',
    ];

    for (const node of graph.nodes) {
        lines.push(buildNodeLine(node));
    }

    if (
        graph.edges.length > 0
        && graph.nodes.length > 0
    ) {
        lines.push('');
    }

    for (const edge of graph.edges) {
        const from =
            sanitizeId(edge.fromNodeId);
        const to =
            sanitizeId(edge.toNodeId);
        if (edge.name.length > 0) {
            const label =
                quoteLabel(edge.name);
            lines.push(
                '  ' + from
                + ' -->|' + label
                + '| ' + to,
            );
        } else {
            lines.push(
                '  ' + from
                + ' --> ' + to,
            );
        }
    }

    return lines.join('\n') + '\n';
}
