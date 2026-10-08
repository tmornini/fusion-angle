import { assert, assertNotEquals, assertStrictEquals } from '@std/assert';
import {
    SHIFT, stays, useBrowser, withAdminPage, type Page,
    type Point,
} from './fixtures.ts';
import {
    CANVAS, EDGE, NODE, ONBOARDING, LAYOUT_TEST,
    doubleClick, doubleClickAt, edgeCount,
    edgeLabelSelector,
    flowGraph, nodeCount, nodeIdNamed,
    nodeSelector, openFlow, portSelector,
} from './canvas.ts';

const browser = useBrowser();

const PANEL = '.flow-props-panel';
const VIEWBOX =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;
// The open panel's node name, or null with no panel.
const PANEL_NODE_NAME =
    `document.querySelector('${PANEL}') === null ? null`
    + ` : document.querySelector('#prop-node-name')`
    + `?.value ?? null`;
const STAY_MS = 600;

// The properties panel covers the canvas's left edge;
// a point under it lands on the panel, not the node.
async function assertClearOfPanel(
    page: Page, pt: Point,
): Promise<void> {
    const panel = await page.rect(PANEL);
    assert(
        pt.x > panel.x + panel.width,
        `x ${pt.x} sits under the properties panel`,
    );
}

Deno.test('a port drag onto empty canvas adds a node and its edge',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const review = await nodeIdNamed(page, 'Review');
        const port = await page.center(portSelector(review));
        const svg = await page.rect(CANVAS);
        await page.drag(port, {
            x: svg.x + svg.width * 0.5,
            y: svg.y + svg.height * 0.92,
        });
        await page.until(
            `document.querySelectorAll('${NODE}').length`
            + ` === ${nodes + 1}`,
            'one more node',
        );
        assertStrictEquals(await edgeCount(page), edges + 1);
    });
});

Deno.test('a shift drag from a port onto a node commits an edge',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        // Only Review and Data Capture expose a connect port,
        // so the drag must start from one of them. The pair
        // must also be absent from the seed — whose edges are
        // Review->Archive, Review->Data Capture, Data
        // Capture->Review, and Create->Data Capture — so Data
        // Capture -> Archive is the pair that tests edge
        // creation.
        const capture = await nodeIdNamed(page, 'Data Capture');
        const archive = await nodeIdNamed(page, 'Archive');
        const port = await page.center(portSelector(capture));
        const target = await page.center(nodeSelector(archive));
        await page.keyDown('Shift');
        await page.drag(port, target, { modifiers: SHIFT });
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assertStrictEquals(await nodeCount(page), nodes);
    });
});

Deno.test('a body drag moves the node and persists its position',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const flowId = await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const before = (await flowGraph(origin, flowId))
            .graph.nodes.find((n) => n.id === review);
        assert(before);
        const from = await page.center(nodeSelector(review));
        await page.drag(from, { x: from.x + 60, y: from.y + 40 });
        let after = before;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            after = (await flowGraph(origin, flowId))
                .graph.nodes.find((n) => n.id === review)!;
            if (after.positionX !== before.positionX
                || after.positionY !== before.positionY) break;
            await new Promise((r) => setTimeout(r, 100));
        }
        assertNotEquals(
            [after.positionX, after.positionY],
            [before.positionX, before.positionY],
        );
    });
});

Deno.test('a marquee on empty canvas selects the nodes it encloses',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const total = await nodeCount(page);
        const svg = await page.rect(CANVAS);
        await page.drag(
            { x: svg.x + 4, y: svg.y + 4 },
            { x: svg.x + svg.width - 4, y: svg.y + svg.height - 4 },
        );
        const selected = await page.until<number>(
            `(() => {
                const n = document.querySelectorAll(
                    '${NODE}[aria-current="true"]').length;
                return n === ${total} ? n : null;
            })()`,
            `${total} nodes selected`,
        );
        assertStrictEquals(selected, total);
    });
});

Deno.test(
    'an edge-label click selects and a double-click'
    + ' opens Transition Properties (F26)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                await page.click(
                    '#flow-auto-fit-switch',
                );
                const label = edgeLabelSelector();
                await page.waitFor(label);
                await doubleClick(page, label);
                await page.waitFor('.flow-props-panel');
                const title = await page.evaluate<
                    string | null
                >(
                    `document.querySelector(`
                    + `'.flow-props-panel h3')`
                    + `?.textContent ?? null`,
                );
                assert(
                    (title ?? '').includes(
                        'Transition Properties',
                    ),
                    `panel title was ${title}`,
                );
            },
        );
    },
);

Deno.test(
    'an edge selection enables Delete and'
    + ' removes the edge (F28)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                const label = edgeLabelSelector();
                await page.waitFor(label);
                const before = await edgeCount(page);
                await page.click(label);
                await page.until(
                    `document.querySelector(`
                    + `'${EDGE}[aria-current="true"]')`
                    + ` !== null`,
                    'edge selected',
                );
                const disabled =
                    await page.evaluate<boolean>(
                        `document.querySelector(`
                        + `'[data-action="delete-selected"]')`
                        + `?.hasAttribute('disabled')`
                        + ` === true`,
                    );
                assertStrictEquals(disabled, false);
                await page.click(
                    '[data-action="delete-selected"]',
                );
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        before - 1
                    }`,
                    'one fewer edge',
                );
            },
        );
    },
);

Deno.test(
    'Shift held mid port-drag commits an edge'
    + ' and adds no node (F23)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const edges = await edgeCount(page);
                const capture = await nodeIdNamed(
                    page, 'Data Capture',
                );
                const archive = await nodeIdNamed(
                    page, 'Archive',
                );
                const port = await page.center(
                    portSelector(capture),
                );
                const target = await page.center(
                    nodeSelector(archive),
                );
                await page.press(port);
                await page.move({
                    x: port.x
                        + (target.x - port.x) * 0.4,
                    y: port.y
                        + (target.y - port.y) * 0.4,
                });
                await page.keyDown('Shift');
                await page.move(target, SHIFT);
                await page.release(target, SHIFT);
                await page.keyUp('Shift');
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        edges + 1
                    }`,
                    'one more edge',
                );
                assertStrictEquals(
                    await nodeCount(page), nodes,
                );
            },
        );
    },
);

Deno.test(
    'plain port-drag on an auto-layout flow adds a'
    + ' node and Undo restores (F37b)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                const port = await page.center(
                    portSelector(review),
                );
                const svg = await page.rect(CANVAS);
                await page.drag(port, {
                    x: svg.x + svg.width * 0.5,
                    y: svg.y + svg.height * 0.92,
                });
                await page.until(
                    `document.querySelectorAll(`
                    + `'${NODE}').length === ${
                        nodes + 1
                    }`,
                    'one more node',
                );
                await page.click(
                    '[data-action="undo"]',
                );
                await page.until(
                    `document.querySelectorAll(`
                    + `'${NODE}').length === ${
                        nodes
                    }`,
                    'undo restored node count',
                );
            },
        );
    },
);

function dispatchChange(
    page: Page, selector: string, value: string,
): Promise<unknown> {
    return page.evaluate(
        `(() => {
            const el = document.querySelector(${
                JSON.stringify(selector)
            });
            el.value = ${JSON.stringify(value)};
            el.dispatchEvent(new Event(
                'change', { bubbles: true }));
        })()`,
    );
}

function dispatchChecked(
    page: Page, selector: string,
): Promise<unknown> {
    return page.evaluate(
        `(() => {
            const el = document.querySelector(${
                JSON.stringify(selector)
            });
            el.checked = true;
            el.dispatchEvent(new Event(
                'change', { bubbles: true }));
        })()`,
    );
}

Deno.test(
    'Shift-drag adds an edge and Review accepts'
    + ' two attribute refs (AA32/AA33/AA34)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                const nodes = await nodeCount(page);
                const edges = await edgeCount(page);
                const capture = await nodeIdNamed(
                    page, 'Data Capture',
                );
                const archive = await nodeIdNamed(
                    page, 'Archive',
                );
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                const port = await page.center(
                    portSelector(capture),
                );
                const target = await page.center(
                    nodeSelector(archive),
                );
                await page.keyDown('Shift');
                await page.drag(
                    port, target, { modifiers: SHIFT },
                );
                await page.keyUp('Shift');
                await page.until(
                    `document.querySelectorAll(`
                    + `'${EDGE}').length === ${
                        edges + 1
                    }`,
                    'one more edge',
                );
                assertStrictEquals(
                    await nodeCount(page), nodes,
                );
                await page.click(
                    '#flow-auto-fit-switch',
                );
                await doubleClick(
                    page, nodeSelector(review),
                );
                await page.waitFor(
                    '#prop-node-attribute-picker',
                );
                const ids = await page.evaluate<
                    string[]
                >(
                    `[...document.querySelectorAll(`
                    + `'#prop-node-attribute-picker`
                    + ` option')].map(o => o.value)`
                    + `.filter(Boolean)`,
                );
                assert(
                    ids.length >= 2, 'two free attrs',
                );
                const first = ids[0]!;
                const second = ids[1]!;
                await dispatchChange(
                    page,
                    '#prop-node-attribute-picker',
                    first,
                );
                await page.waitFor(
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`,
                );
                await dispatchChange(
                    page,
                    '#prop-node-attribute-picker',
                    second,
                );
                await page.waitFor(
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${second}"]`,
                );
                await dispatchChange(
                    page,
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`
                    + ` [data-action="update-attribute-mode"]`,
                    'readonly',
                );
                await dispatchChecked(
                    page,
                    `.flow-attribute-ref-row`
                    + `[data-attribute-id="${second}"]`
                    + ` [data-action="update-attribute-required"]`,
                );
                const mode = await page.until<string>(
                    `document.querySelector(`
                    + `'.flow-attribute-ref-row`
                    + `[data-attribute-id="${first}"]`
                    + ` [data-action="update-attribute-mode"]')`
                    + `?.value`,
                    'mode readonly',
                );
                const required =
                    await page.evaluate<boolean>(
                        `document.querySelector(`
                        + `'.flow-attribute-ref-row`
                        + `[data-attribute-id="${second}"]`
                        + ` [data-action="update-attribute-required"]')`
                        + `?.checked === true`,
                    );
                assertStrictEquals(mode, 'readonly');
                assertStrictEquals(required, true);
            },
        );
    },
);

Deno.test('a node click under an open panel centers it'
+ ' on release (F13)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        const before = await page.evaluate<string>(VIEWBOX);
        const body = await page.center(
            nodeSelector(capture),
        );
        await assertClearOfPanel(page, body);
        await page.press(body);
        await page.release(body);
        await page.until(
            `${VIEWBOX} !== ${JSON.stringify(before)}`,
            'camera centred on Data Capture',
        );
    });
});

Deno.test('a double-click on a second node under an open'
+ ' panel keeps the panel on it (F13)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        // Aimed once, at the body: the `g`'s box holds the
        // port. A body holding the center of the canvas
        // right of the panel barely moves at the first
        // release, so the second press could not miss it.
        const bodySelector = `${nodeSelector(capture)} > rect`;
        const body = await page.center(bodySelector);
        await assertClearOfPanel(page, body);
        const canvas = await page.rect(CANVAS);
        const panel = await page.rect(PANEL);
        const left = Math.max(
            canvas.x, panel.x + panel.width,
        );
        const cx = (left + canvas.x + canvas.width) / 2;
        const cy = canvas.y + canvas.height / 2;
        const box = await page.rect(bodySelector);
        assert(
            cx < box.x || cx > box.x + box.width
                || cy < box.y || cy > box.y + box.height,
            `Data Capture holds the visible center`
            + ` (${cx}, ${cy})`,
        );
        await doubleClickAt(page, body);
        await stays(page, PANEL_NODE_NAME, STAY_MS);
        assertStrictEquals(
            await page.evaluate<string | null>(
                PANEL_NODE_NAME,
            ),
            'Data Capture',
        );
    });
});

Deno.test('a port press under an open panel holds the'
+ ' camera (AA32)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const review = await nodeIdNamed(page, 'Review');
        const capture = await nodeIdNamed(
            page, 'Data Capture',
        );
        const archive = await nodeIdNamed(page, 'Archive');
        // The panel opens on Review; the press then moves
        // the selection to Data Capture, as AA31 → AA32.
        await doubleClick(page, nodeSelector(review));
        await page.waitFor(PANEL);
        const before = await page.evaluate<string>(VIEWBOX);
        // Aimed before the press, as a person aims.
        const port = await page.center(
            portSelector(capture),
        );
        const target = await page.center(
            nodeSelector(archive),
        );
        await assertClearOfPanel(page, port);
        await assertClearOfPanel(page, target);
        await page.keyDown('Shift');
        await page.press(port, SHIFT);
        assertStrictEquals(
            await page.evaluate<string>(VIEWBOX), before,
        );
        await page.move({
            x: (port.x + target.x) / 2,
            y: (port.y + target.y) / 2,
        }, SHIFT);
        await page.move(target, SHIFT);
        await page.release(target, SHIFT);
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assertStrictEquals(await nodeCount(page), nodes);
    });
});

Deno.test('a port press after Auto Layout toggles holds'
+ ' the camera (F19)', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, LAYOUT_TEST);
        // F18: off, then on — the second leaves the
        // provisional node-bounds fit.
        await page.click('#flow-auto-layout-switch');
        await page.click('#flow-auto-layout-switch');
        const nodes = await nodeCount(page);
        const edges = await edgeCount(page);
        const draft = await nodeIdNamed(page, 'Draft');
        const triage = await nodeIdNamed(page, 'Triage');
        const before = await page.evaluate<string>(VIEWBOX);
        const port = await page.center(portSelector(draft));
        const target = await page.center(
            nodeSelector(triage),
        );
        await page.keyDown('Shift');
        await page.press(port, SHIFT);
        assertStrictEquals(
            await page.evaluate<string>(VIEWBOX), before,
        );
        await page.move({
            x: (port.x + target.x) / 2,
            y: (port.y + target.y) / 2,
        }, SHIFT);
        await page.move(target, SHIFT);
        await page.release(target, SHIFT);
        await page.keyUp('Shift');
        await page.until(
            `document.querySelectorAll('${EDGE}').length`
            + ` === ${edges + 1}`,
            'one more edge',
        );
        assertStrictEquals(await nodeCount(page), nodes);
    });
});
