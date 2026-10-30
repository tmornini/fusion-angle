import { assertEquals } from '@std/assert';
import {
    objectiveCardHit,
    type ObjectiveCardHit,
} from '../web-app/dashboard/objective-card-hit.ts';

interface HitNode {
    closest: (selector: string) => HitNode | null;
    getAttribute: (name: string) => string | null;
}

function node(
    matches: Readonly<Record<string, HitNode | null>>,
    attributes: Readonly<Record<string, string>> = {},
): HitNode {
    return {
        closest: (selector: string) =>
            matches[selector] ?? null,
        getAttribute: (name: string) =>
            attributes[name] ?? null,
    };
}

function hit(target: HitNode): ObjectiveCardHit {
    return objectiveCardHit(
        target as unknown as Element,
    );
}

Deno.test('a row opens its objective', () => {
    const row = node(
        { '[data-objective-id]': null },
        { 'data-objective-id': 'obj-1' },
    );
    row.closest = (selector: string) =>
        selector === '[data-objective-id]'
            ? row
            : null;
    assertEquals(hit(row), {
        kind: 'open',
        objectiveId: 'obj-1',
    });
});

Deno.test(
    'a spark dot inside a row does not open it',
    () => {
        const row = node({}, {
            'data-objective-id': 'obj-1',
        });
        row.closest = (selector: string) =>
            selector === '[data-objective-id]'
                ? row
                : null;
        const dot = node({});
        dot.closest = (selector: string) => {
            if (selector === '.spark-dot') return dot;
            if (selector === '[data-objective-id]') {
                return row;
            }
            return null;
        };
        assertEquals(hit(dot), { kind: 'none' });
    },
);

Deno.test('the back button closes the drill', () => {
    const button = node({});
    button.closest = (selector: string) =>
        selector === '[data-drill-back]'
            ? button
            : null;
    assertEquals(hit(button), { kind: 'close' });
});

Deno.test(
    'a project link does not open or close',
    () => {
        const row = node({}, {
            'data-objective-id': 'obj-1',
        });
        row.closest = (selector: string) =>
            selector === '[data-objective-id]'
                ? row
                : null;
        const anchor = node({});
        anchor.closest = (selector: string) => {
            if (selector === 'a') return anchor;
            if (selector === '[data-objective-id]') {
                return row;
            }
            return null;
        };
        assertEquals(hit(anchor), { kind: 'none' });
    },
);

Deno.test('empty card chrome is not a hit', () => {
    assertEquals(
        hit(node({})),
        { kind: 'none' },
    );
});
