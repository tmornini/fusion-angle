import { assertEquals } from '@std/assert';

// A pill sits beside state badges (the idea list's
// Incomplete pill next to Active), so it wears the
// badge's border: the same base line and, per tone, the
// same border color.

const src = Deno.readTextFileSync(
    'web-app/app/styles/components-badges.css',
);

function declaration(
    selector: string,
    property: string,
): string | undefined {
    const open = src.indexOf(`\n${selector} {\n`);
    const close = src.indexOf('\n}', open);
    const body = src.slice(open, close);
    const match = body.match(
        new RegExp(`^\\s*${property}: (.+);$`, 'm'),
    );
    return match?.[1];
}

Deno.test('a pill wears the badge border', () => {
    assertEquals(
        declaration('.pill', 'border'),
        declaration('.badge', 'border'),
    );
});

for (const tone of ['success', 'warning', 'error']) {
    Deno.test(`a ${tone} pill borders like a ${tone} badge`,
    () => {
        assertEquals(
            declaration(
                `.pill[data-tone="${tone}"]`,
                'border-color',
            ),
            declaration(`.badge-${tone}`, 'border-color'),
        );
    });
}
