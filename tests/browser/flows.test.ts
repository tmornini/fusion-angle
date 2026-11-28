import { assert, assertStrictEquals } from '@std/assert';
import {
    useBrowser,
    withAdminPage,
    type Origin,
    type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const LAYOUT_TEST = 'Layout Test: Proposal Review Cycle';
const ONBOARDING = 'Customer Onboarding';
const PANEL_NAME = `document.querySelector(`
    + `'#flow-panel h2')?.textContent.trim()`;

// The id on the card whose title reads `name`.
function cardIdOf(page: Page, name: string): Promise<string> {
    return page.until<string>(
        `[...document.querySelectorAll('[data-flow-card]')]
            .find(c => c.querySelector('h3')?.textContent.trim()
                === ${JSON.stringify(name)})
            ?.getAttribute('data-flow-card') ?? false`,
        'a card for ' + name,
    );
}

function addressId(page: Page): Promise<string | null> {
    return page.evaluate<string | null>(
        `new URLSearchParams(location.search).get('id')`,
    );
}

async function openFlows(
    page: Page, origin: Origin, query = '',
): Promise<void> {
    await page.navigate(
        registryUrl(origin.baseUrl, 'flows', query),
    );
    await page.ready('flows');
    await page.until(
        `${PANEL_NAME} !== undefined`, 'a flow in the panel',
    );
}

function untilPanelNames(page: Page, name: string): Promise<unknown> {
    return page.until(
        `${PANEL_NAME} === ${JSON.stringify(name)}`,
        'the panel holds ' + name,
    );
}

function untilDrawn(page: Page): Promise<unknown> {
    return page.waitFor('#flow-preview svg .flow-node');
}

Deno.test(
    'the flows page opens the first flow beside the list',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openFlows(page, origin);
            const first = await page.evaluate<string>(
                `document.querySelector('[data-flow-card] h3')
                    .textContent.trim()`,
            );
            await untilPanelNames(page, first);
            await untilDrawn(page);
            assert(await page.evaluate<boolean>(
                `document.querySelector('[data-flow-card]')
                    .getAttribute('aria-current') === 'true'`,
            ));
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(
                        '[data-flow-card][aria-current]').length`,
                ),
                1,
            );
        });
    },
);

Deno.test(
    'the address names the flow the panel opens, drawn'
    + ' read-only with its readiness',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openFlows(page, origin);
            const id = await cardIdOf(page, LAYOUT_TEST);
            await openFlows(page, origin, 'id=' + id);
            await untilPanelNames(page, LAYOUT_TEST);
            await untilDrawn(page);
            assertStrictEquals(
                await page.evaluate<string>(
                    `document.querySelector('[data-flow-readiness]')
                        .getAttribute('data-flow-readiness')`,
                ),
                'not-ready',
            );
            // The drawing takes no focus and has no ports.
            assertStrictEquals(
                await page.evaluate<boolean>(
                    `document.querySelector('.flow-preview-canvas')
                        .inert`,
                ),
                true,
            );
            assertStrictEquals(
                await page.evaluate<number>(
                    `[...document.querySelectorAll(
                        '#flow-preview [data-connect-port]')]
                        .filter(p => p.getBoundingClientRect()
                            .width > 0).length`,
                ),
                0,
            );
            assert(
                (await page.evaluate<string>(
                    `document.querySelector('#flow-panel a.btn-primary')
                        .getAttribute('href')`,
                )).endsWith('flows/detail.html?flowId=' + id),
            );
        });
    },
);

Deno.test(
    'a card click opens its flow in the panel and names it'
    + ' in the address',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openFlows(page, origin);
            const target = await cardIdOf(page, ONBOARDING);
            const other = await cardIdOf(page, LAYOUT_TEST);
            await openFlows(page, origin, 'id=' + other);
            await untilPanelNames(page, LAYOUT_TEST);
            await page.click(
                `[data-flow-card="${target}"] .flex-fill`,
            );
            await untilPanelNames(page, ONBOARDING);
            assertStrictEquals(await addressId(page), target);
            assert(await page.evaluate<boolean>(
                `location.pathname.endsWith('/flows/index.html')`,
            ));
            assert(await page.evaluate<boolean>(
                `document.querySelector('[data-flow-card="${target}"]')
                    .getAttribute('aria-current') === 'true'`,
            ));
        });
    },
);

Deno.test(
    'hovering a state in the designer fades what it does'
    + ' not touch',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openFlows(page, origin);
            const id = await cardIdOf(page, LAYOUT_TEST);
            await page.navigate(registryUrl(
                origin.baseUrl, 'flow-detail', 'flowId=' + id,
            ));
            await page.ready('flow-detail');
            const deep = '.flow-canvas [data-node-id][aria-label='
                + '"Deep Review"]';
            await page.waitFor(deep);
            await page.hover(await page.center(deep));
            await page.until(
                `document.querySelector('svg.flow-canvas')
                    .classList.contains('flow-focusing')`,
                'the canvas focusing',
            );
            // Deep Review, Triage before it, the four panels
            // after it; the five transitions between them.
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(
                        '.flow-canvas .flow-node.flow-lit').length`,
                ),
                6,
            );
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(
                        '.flow-canvas .flow-edge.flow-lit').length`,
                ),
                5,
            );
            const wrap = await page.rect('.flow-canvas-wrap');
            await page.hover({ x: wrap.x + 4, y: wrap.y + 4 });
            await page.hover({ x: 4, y: 4 });
            await page.until(
                `!document.querySelector('svg.flow-canvas')
                    .classList.contains('flow-focusing')`,
                'the focus cleared',
            );
        });
    },
);

Deno.test(
    'the designer\'s back button reopens the list on its flow',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openFlows(page, origin);
            const id = await cardIdOf(page, LAYOUT_TEST);
            await page.navigate(registryUrl(
                origin.baseUrl, 'flow-detail', 'flowId=' + id,
            ));
            await page.ready('flow-detail');
            await page.click('#flow-back-btn');
            await page.ready('flows');
            await untilPanelNames(page, LAYOUT_TEST);
            assertStrictEquals(await addressId(page), id);
        });
    },
);
