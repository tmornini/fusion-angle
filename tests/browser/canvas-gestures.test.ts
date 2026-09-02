import { assert, assertNotEquals, assertStrictEquals } from '@std/assert';
import { SHIFT, useBrowser, withAdminPage } from
    './fixtures.ts';
import {
    CANVAS, EDGE, NODE, ONBOARDING,
    edgeCount, flowGraph, nodeCount, nodeIdNamed,
    nodeSelector, openFlow, portSelector,
} from './canvas.ts';

const browser = useBrowser();

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
