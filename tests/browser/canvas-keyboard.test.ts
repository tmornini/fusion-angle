import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import {
    CANVAS, NODE, ONBOARDING,
    edgeCount, nodeCount, nodeIdNamed, openFlow,
} from './canvas.ts';

const browser = useBrowser();

// wrap.querySelectorAll('.flow-node, .flow-edge') returns
// document order, and buildCanvas (flow-graph.ts) emits
// edgeMarkup before nodeMarkup, so every edge precedes
// every node in the tab ring — the first node the ring
// reaches on Customer Onboarding is Archive. Archive and
// Create are special nodes (see canShowPort in
// flow-graph.ts) whose properties panel is a read-only
// form with no #prop-node-name, so only an editable node
// makes "Enter opens the panel" observable. Advance the
// ring to a node id by name instead of to the first node
// reached; the bound is the whole ring so an absent
// target fails loudly instead of hanging.
async function tabToNode(
    page: Page, nodeId: string,
): Promise<void> {
    const bound =
        await nodeCount(page) + await edgeCount(page);
    for (let i = 0; i < bound; i += 1) {
        await page.key('Tab');
        const onTarget = await page.evaluate<boolean>(
            `document.activeElement`
            + `?.closest('[data-node-id]')`
            + `?.getAttribute('data-node-id')`
            + ` === ${JSON.stringify(nodeId)}`,
        );
        if (onTarget) return;
    }
    throw new Error(`Tab never reached node ${nodeId}`);
}

test('Tab from the canvas enters the ring and marks the node',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        const target = await nodeIdNamed(page, 'Data Capture');
        await page.evaluate(
            `document.querySelector('${CANVAS}').focus()`,
        );
        await tabToNode(page, target);
        const current = await page.until<string>(
            `(() => {
                const a = document.activeElement;
                if (!a || !a.classList.contains('flow-node'))
                    return null;
                return a.getAttribute('aria-current');
            })()`,
            'a focused node',
        );
        assert.equal(current, 'true');
        await page.key('Enter');
        await page.waitFor('#prop-node-name');
        const count = await page.evaluate<number>(
            `document.querySelectorAll(`
            + `'${NODE}[aria-current="true"]').length`,
        );
        assert.equal(count, 1);
    });
});
