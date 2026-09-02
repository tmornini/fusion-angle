import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import { buildGraphSvg } from
    '../web-app/app/flow-graph.ts';
import type {
    GraphEdge,
    GraphNode,
} from '../api/types.ts';

function node(
    id: string,
    overrides: Partial<GraphNode> = {},
): GraphNode {
    return {
        id,
        name: 'N',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
    };
}

function edge(
    id: string,
    from: string,
    to: string,
): GraphEdge {
    return {
        id,
        name: 'go',
        fromNodeId: from,
        toNodeId: to,
    };
}

function render(isLocked: boolean): string {
    return buildGraphSvg(
        [
            node('c', {
                name: 'Create',
                isCreate: true,
            }),
            node('r', {
                name: 'Regular',
                positionX: 200,
            }),
            node('a', {
                name: 'Archive',
                isArchive: true,
                positionX: 400,
            }),
        ],
        [
            edge('e1', 'c', 'r'),
            edge('e2', 'r', 'a'),
        ],
        0, 0, 800, 600,
        { kind: 'none' },
        isLocked, false, null,
        new Map(),
        '',
    ).toString();
}

const ACCENT = 'hsl(var(--accent-text))';
const PRIMARY = 'hsl(var(--primary))';
const SUCCESS = 'hsl(var(--success))';
const ERROR = 'hsl(var(--error))';

Deno.test(
    'a locked canvas paints node and edge strokes'
    + ' as accent-text, not type colors',
    () => {
        const out = render(true);
        assert(out.includes('flow-canvas-locked'));
        assert(
            out.includes(`stroke="${ACCENT}"`),
        );
        assertStrictEquals(
            out.includes(`stroke="${PRIMARY}"`),
            false,
        );
        assertStrictEquals(
            out.includes(`stroke="${SUCCESS}"`),
            false,
        );
        assertStrictEquals(
            out.includes(`stroke="${ERROR}"`),
            false,
        );
    },
);

Deno.test(
    'the canvas svg is a tab stop for Space pan',
    () => {
        const out = render(false);
        assertMatch(
            out,
            /<svg\b[^>]*\btabindex="0"/,
        );
    },
);

Deno.test(
    'an unlocked canvas keeps per-type strokes',
    () => {
        const out = render(false);
        assertStrictEquals(
            out.includes('flow-canvas-locked'),
            false,
        );
        assert(
            out.includes(`stroke="${PRIMARY}"`),
        );
        assert(
            out.includes(`stroke="${SUCCESS}"`),
        );
        assert(
            out.includes(`stroke="${ERROR}"`),
        );
        assertStrictEquals(
            out.includes(`stroke="${ACCENT}"`),
            false,
        );
    },
);
