import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test(
    'a locked canvas paints node and edge strokes'
    + ' as accent-text, not type colors',
    () => {
        const out = render(true);
        assert.ok(out.includes('flow-canvas-locked'));
        assert.ok(
            out.includes(`stroke="${ACCENT}"`),
        );
        assert.equal(
            out.includes(`stroke="${PRIMARY}"`),
            false,
        );
        assert.equal(
            out.includes(`stroke="${SUCCESS}"`),
            false,
        );
        assert.equal(
            out.includes(`stroke="${ERROR}"`),
            false,
        );
    },
);

test(
    'the canvas svg is a tab stop for Space pan',
    () => {
        const out = render(false);
        assert.match(
            out,
            /<svg\b[^>]*\btabindex="0"/,
        );
    },
);

test(
    'an unlocked canvas keeps per-type strokes',
    () => {
        const out = render(false);
        assert.equal(
            out.includes('flow-canvas-locked'),
            false,
        );
        assert.ok(
            out.includes(`stroke="${PRIMARY}"`),
        );
        assert.ok(
            out.includes(`stroke="${SUCCESS}"`),
        );
        assert.ok(
            out.includes(`stroke="${ERROR}"`),
        );
        assert.equal(
            out.includes(`stroke="${ACCENT}"`),
            false,
        );
    },
);
