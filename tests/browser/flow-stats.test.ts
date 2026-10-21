import { assert, assertStrictEquals } from '@std/assert';
import { stays, useBrowser, withAdminPage } from
    './fixtures.ts';
import { ONBOARDING, flowGraph, flowIdNamed } from
    './canvas.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const CARD_HOLD_MS = 500;
const CARD_SHOWN = `!document.querySelector(`
    + `'#flow-stats-card').classList.contains('hidden')`;

Deno.test('a hovered stats node keeps its card open',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const flowId = await flowIdNamed(origin, ONBOARDING);
        const review = (await flowGraph(origin, flowId))
            .graph.nodes.find((n) => n.name === 'Review');
        assert(review);
        await page.navigate(registryUrl(
            origin.baseUrl, 'flow-stats', `flowId=${flowId}`,
        ));
        await page.ready('flow-stats');
        const node = `#flow-stats [data-node-id="${review.id}"]`;
        await page.waitFor(node);
        const r = await page.rect(node);
        const at = { x: r.x + r.width * 0.75,
            y: r.y + r.height / 2 };
        await page.hover(at);
        await page.until(CARD_SHOWN, 'card shown');
        assertStrictEquals(await page.evaluate<string | null>(
            `document.elementFromPoint(${at.x}, ${at.y})`
            + `?.closest('[data-node-id]')`
            + `?.getAttribute('data-node-id') ?? null`,
        ), review.id);
        await stays(page, CARD_SHOWN, CARD_HOLD_MS);
    });
});
