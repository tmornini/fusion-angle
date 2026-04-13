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

/* ── Diagram type dispatch ─────────── */

type DiagramType = 'flowchart' | 'state';

function detectDiagramType(
    text: string,
): DiagramType | null {
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (
            line.length === 0
            || line.startsWith('%%')
        ) {
            continue;
        }
        if (/^(flowchart|graph)\b/.test(line)) {
            return 'flowchart';
        }
        if (
            /^stateDiagram(-v2)?\b/
                .test(line)
        ) {
            return 'state';
        }
        return null;
    }
    return null;
}

/* ── Flowchart parser ──────────────── */

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
    const type = detectDiagramType(text);
    if (type === 'flowchart') {
        return parseFlowchart(text);
    }
    if (type === 'state') {
        return parseStateDiagram(text);
    }
    throw new Error(
        'Unsupported mermaid diagram type.'
        + ' Expected flowchart or'
        + ' stateDiagram.',
    );
}

function parseFlowchart(
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

    return {
        nodes: [...nodes.values()],
        edges,
        warnings,
    };
}

/* ── State diagram parser ──────────── */

const STATE_HEADER_RE =
    /^stateDiagram(-v2)?\s*$/;
const STATE_EDGE_RE = new RegExp(
    '^(\\[\\*\\]|\\S+)\\s+-->\\s+'
    + '(\\[\\*\\]|\\S+)'
    + '(?:\\s*:\\s*(.+?))?\\s*$',
);
const STATE_DECL_QUOTED_RE =
    /^state\s+"(.+?)"\s+as\s+(\S+)\s*$/;
const STATE_DECL_BARE_RE =
    /^state\s+(\S+)\s*$/;
const NOTE_SINGLE_RE =
    /^note\s+(right|left|above|below)\s+of\s+\S+\s*:.*$/;
const NOTE_BLOCK_START_RE =
    /^note\s+(right|left|above|below)\s+of\s+\S+\s*$/;
const NOTE_BLOCK_END_RE =
    /^end\s+note\s*$/;
const COMPOSITE_OPEN_RE =
    /^state\s+\S+\s*\{\s*$/;
const COMPOSITE_CLOSE_RE =
    /^\}\s*$/;

const STATE_PSEUDO = '[*]';
const STATE_START_NAME = 'Start';
const STATE_COMPLETE_NAME = 'Complete';

function parseStateDiagram(
    text: string,
): ParsedFlowchart {
    const lines = text.split('\n');
    const nodes =
        new Map<string, ParsedNode>();
    const edges: ParsedEdge[] = [];
    const warnings: string[] = [];
    let inNoteBlock = false;
    let compositeDepth = 0;
    let pseudoCounter = 0;

    const addPseudo = (
        kind: 'start' | 'complete',
    ): string => {
        pseudoCounter += 1;
        const id =
            '__' + kind + '_'
            + String(pseudoCounter)
            + '__';
        nodes.set(id, {
            mermaidId: id,
            name: kind === 'start'
                ? STATE_START_NAME
                : STATE_COMPLETE_NAME,
            isStart: kind === 'start',
            isComplete: kind === 'complete',
        });
        return id;
    };

    const ensureStateNode = (
        id: string,
    ): void => {
        if (!nodes.has(id)) {
            nodes.set(id, {
                mermaidId: id,
                name: id,
                isStart: false,
                isComplete: false,
            });
        }
    };

    const resolveToken = (
        token: string,
        pseudoKind: 'start' | 'complete',
    ): string => {
        if (token === STATE_PSEUDO) {
            return addPseudo(pseudoKind);
        }
        ensureStateNode(token);
        return token;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (
            line.length === 0
            || line.startsWith('%%')
        ) {
            continue;
        }

        if (inNoteBlock) {
            if (
                NOTE_BLOCK_END_RE.test(line)
            ) {
                inNoteBlock = false;
            }
            continue;
        }

        if (STATE_HEADER_RE.test(line)) {
            continue;
        }

        if (
            COMPOSITE_CLOSE_RE.test(line)
        ) {
            if (compositeDepth > 0) {
                compositeDepth -= 1;
            }
            continue;
        }

        if (COMPOSITE_OPEN_RE.test(line)) {
            compositeDepth += 1;
            warnings.push(
                'Composite state skipped:'
                + ' ' + line,
            );
            continue;
        }

        if (compositeDepth > 0) {
            warnings.push(
                'Skipped inside composite:'
                + ' ' + line,
            );
            continue;
        }

        if (
            NOTE_BLOCK_START_RE.test(line)
        ) {
            inNoteBlock = true;
            warnings.push(
                'Skipped note: ' + line,
            );
            continue;
        }
        if (NOTE_SINGLE_RE.test(line)) {
            warnings.push(
                'Skipped note: ' + line,
            );
            continue;
        }

        const quoted =
            STATE_DECL_QUOTED_RE
                .exec(line);
        if (quoted) {
            const displayName = quoted[1]!;
            const id = quoted[2]!;
            nodes.set(id, {
                mermaidId: id,
                name: displayName,
                isStart: false,
                isComplete: false,
            });
            continue;
        }
        const bare =
            STATE_DECL_BARE_RE.exec(line);
        if (bare) {
            ensureStateNode(bare[1]!);
            continue;
        }

        const edgeMatch =
            STATE_EDGE_RE.exec(line);
        if (edgeMatch) {
            const fromToken = edgeMatch[1]!;
            const toToken = edgeMatch[2]!;
            const label =
                edgeMatch[3] !== undefined
                    ? edgeMatch[3].trim()
                    : '';
            const fromId = resolveToken(
                fromToken, 'start',
            );
            const toId = resolveToken(
                toToken, 'complete',
            );
            edges.push({
                fromId,
                toId,
                name: label,
            });
            continue;
        }

        warnings.push('Skipped: ' + line);
    }

    return {
        nodes: [...nodes.values()],
        edges,
        warnings,
    };
}
