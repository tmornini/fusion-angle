import { assertMatch } from '@std/assert';
import { buildGraphSvg } from
    '../web-app/app/flow-graph.ts';
import type { GraphNode } from '../api/types.ts';

function node(id: string): GraphNode {
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
    };
}

function render(
    marqueeRect: { x: number; y: number; w: number; h: number }
        | null,
): string {
    return buildGraphSvg(
        [node('a')],
        [],
        0, 0, 800, 600,
        { kind: 'none' },
        false, false, marqueeRect,
        new Map(),
        '',
    ).toString();
}

// The marquee rect is always built — zero-sized when idle
// — so a gesture frame that lands on a rebuild from the
// idle snapshot finds its target, the same unconditional
// presence as .flow-grid-bg, .flow-grid-dots, and
// .flow-connect-preview.
Deno.test('an idle canvas still carries the marquee rect',
() => {
    const svg = render(null);
    assertMatch(svg, /class="flow-marquee"/);
    assertMatch(
        svg,
        new RegExp(
            '<rect x="0" y="0" width="0" height="0"'
            + ' aria-hidden="true"'
            + ' class="flow-marquee"/>',
        ),
    );
});

Deno.test('a selecting canvas carries the drawn rect', () => {
    const svg = render({ x: 10, y: 20, w: 30, h: 40 });
    assertMatch(
        svg,
        new RegExp(
            '<rect x="10" y="20" width="30" height="40"'
            + ' aria-hidden="true"'
            + ' class="flow-marquee"/>',
        ),
    );
});
