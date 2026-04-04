export interface ParsedNode {
    mermaidId: string;
    name: string;
    isStart: boolean;
    isComplete: boolean;
}

export interface ParsedEdge {
    fromId: string;
    toId: string;
    name: string;
}

export interface ParsedFlowchart {
    nodes: ParsedNode[];
    edges: ParsedEdge[];
    warnings: string[];
}

const HEADER_RE =
    /^flowchart\s+(LR|TD|TB|BT|RL)\s*$/;

const SKIP_KEYWORDS = [
    'classDef', 'class\\s', 'click\\s',
    'style\\s', 'subgraph', 'end\\s*$',
    'linkStyle', 'direction\\s', ':::',
];
const SKIP_RE = new RegExp(
    '^\\s*(' + SKIP_KEYWORDS.join('|') + ')',
);

/* node shapes */

const DOUBLE_CIRCLE_RE =
    /^(\S+?)\(\(\((.+?)\)\)\)\s*$/;
const STADIUM_RE =
    /^(\S+?)\(\[(.+?)\]\)\s*$/;
const RECT_RE =
    /^(\S+?)\[(.+?)\]\s*$/;

/* edges */

const EDGE_RE = new RegExp(
    '^'
    + '(\\S+(?:\\([^)]*\\)'
    + '|\\[[^\\]]*\\]'
    + '|\\({3}[^)]*\\){3})?)'
    + '\\s+'
    + '(?:-->|-.->|==>)'
    + '(?:\\|(.+?)\\|)?'
    + '\\s+'
    + '(\\S+(?:\\([^)]*\\)'
    + '|\\[[^\\]]*\\]'
    + '|\\({3}[^)]*\\){3})?)'
    + '\\s*$',
);

function unquote(s: string): string {
    if (
        s.startsWith('"')
        && s.endsWith('"')
    ) {
        return s.slice(1, -1)
            .replaceAll('&quot;', '"');
    }
    return s;
}

function extractNodeDecl(
    token: string,
): ParsedNode | null {
    let m = DOUBLE_CIRCLE_RE.exec(token);
    if (m) {
        return {
            mermaidId: m[1]!,
            name: unquote(m[2]!),
            isStart: false,
            isComplete: true,
        };
    }
    m = STADIUM_RE.exec(token);
    if (m) {
        return {
            mermaidId: m[1]!,
            name: unquote(m[2]!),
            isStart: true,
            isComplete: false,
        };
    }
    m = RECT_RE.exec(token);
    if (m) {
        return {
            mermaidId: m[1]!,
            name: unquote(m[2]!),
            isStart: false,
            isComplete: false,
        };
    }
    return null;
}

function ensureNode(
    map: Map<string, ParsedNode>,
    token: string,
): string {
    const decl = extractNodeDecl(token);
    if (decl) {
        if (!map.has(decl.mermaidId)) {
            map.set(decl.mermaidId, decl);
        }
        return decl.mermaidId;
    }
    const id = token.trim();
    if (!map.has(id)) {
        map.set(id, {
            mermaidId: id,
            name: id,
            isStart: false,
            isComplete: false,
        });
    }
    return id;
}

export function parseMermaid(
    text: string,
): ParsedFlowchart {
    const lines = text.split('\n');
    const nodes =
        new Map<string, ParsedNode>();
    const edges: ParsedEdge[] = [];
    const warnings: string[] = [];
    let headerSeen = false;

    for (const raw of lines) {
        const line = raw.trim();
        if (
            line.length === 0
            || line.startsWith('%%')
        ) {
            continue;
        }

        if (!headerSeen) {
            if (HEADER_RE.test(line)) {
                headerSeen = true;
                continue;
            }
            if (
                line.startsWith('flowchart')
                || line.startsWith('graph')
            ) {
                headerSeen = true;
                continue;
            }
        }

        if (SKIP_RE.test(line)) {
            warnings.push(
                'Skipped: ' + line,
            );
            continue;
        }

        const edgeMatch =
            EDGE_RE.exec(line);
        if (edgeMatch) {
            const fromId = ensureNode(
                nodes, edgeMatch[1]!,
            );
            const toId = ensureNode(
                nodes, edgeMatch[3]!,
            );
            const label =
                edgeMatch[2] !== undefined
                    ? unquote(edgeMatch[2])
                    : '';
            edges.push({
                fromId,
                toId,
                name: label,
            });
            continue;
        }

        const nodeDecl =
            extractNodeDecl(line);
        if (nodeDecl) {
            if (!nodes.has(
                nodeDecl.mermaidId,
            )) {
                nodes.set(
                    nodeDecl.mermaidId,
                    nodeDecl,
                );
            }
            continue;
        }

        if (headerSeen && line.length > 0) {
            warnings.push(
                'Skipped: ' + line,
            );
        }
    }

    const result = [...nodes.values()];

    inferStartEnd(result, edges);

    return {
        nodes: result,
        edges,
        warnings,
    };
}

function inferStartEnd(
    nodes: ParsedNode[],
    edges: ParsedEdge[],
): void {
    const hasStart = nodes.some(
        n => n.isStart,
    );
    const hasComplete = nodes.some(
        n => n.isComplete,
    );

    if (!hasStart && nodes.length > 0) {
        const incoming = new Set(
            edges.map(e => e.toId),
        );
        const candidate = nodes.find(
            n => !incoming.has(n.mermaidId),
        );
        if (candidate) {
            candidate.isStart = true;
        } else {
            nodes[0]!.isStart = true;
        }
    }

    if (!hasComplete && nodes.length > 0) {
        const outgoing = new Set(
            edges.map(e => e.fromId),
        );
        const candidate = nodes.find(
            n => !outgoing.has(n.mermaidId)
                && !n.isStart,
        );
        if (candidate) {
            candidate.isComplete = true;
        } else {
            const last =
                nodes[nodes.length - 1];
            if (last) {
                last.isComplete = true;
            }
        }
    }
}
