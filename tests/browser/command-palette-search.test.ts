import { assert, assertStrictEquals } from '@std/assert';
import {
    stays,
    useBrowser,
    withAdminPage,
    type Origin,
    type Page,
    type RequestHold,
    withHeldRequests,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();

// A margin for an answer to land and paint.
const SETTLE_MS = 600;

// A typo of the seeded idea "Predictive Maintenance
// System", which only the organization's QUERY can find.
const IDEA_TYPO = 'predictve';
const IDEA_ITEM = 'idea-yrDiezFyhDHGgXzGeIWoSQ';
// A typo of the Workbox page, which no seeded idea,
// project, or member matches.
const PAGE_TYPO = 'wrkbox';

const ITEM_IDS = `JSON.stringify([...document.querySelectorAll(`
    + `'#command-palette-listbox .command-palette-item')]`
    + `.map(item => item.dataset.itemId))`;

async function itemIds(page: Page): Promise<string[]> {
    return JSON.parse(await page.evaluate<string>(ITEM_IDS));
}

function hasItem(id: string): string {
    return `JSON.parse(${ITEM_IDS}).includes(${
        JSON.stringify(id)})`;
}

// Opens the palette with its hotkey and waits for the
// empty query's index to paint.
async function openPalette(
    page: Page, origin: Origin,
): Promise<string> {
    await page.navigate(registryUrl(origin.baseUrl, 'ideas'));
    await page.ready('ideas');
    await pressHotkey(page);
    await page.until(
        `document.querySelectorAll(`
        + `'#command-palette-listbox .command-palette-item')`
        + `.length > 0`,
        "the palette's index",
    );
    return await page.evaluate<string>(ITEM_IDS);
}

async function pressHotkey(page: Page): Promise<void> {
    await page.evaluate(
        `document.dispatchEvent(new KeyboardEvent('keydown',`
        + ` { key: 'k', ctrlKey: true, bubbles: true }))`,
    );
}

async function typeInPalette(
    page: Page, text: string,
): Promise<void> {
    await page.evaluate(`(() => {
        const input = document.querySelector(
            '.command-palette-input');
        input.value = ${JSON.stringify(text)};
        input.dispatchEvent(
            new Event('input', { bubbles: true }));
    })()`);
}

// Marks every painted item, so a later wait can see the
// list was painted again even when its ids are the same.
async function markItems(page: Page): Promise<void> {
    await page.evaluate(
        `document.querySelectorAll(`
        + `'#command-palette-listbox .command-palette-item')`
        + `.forEach(item => item.dataset.painted = 'before')`,
    );
}

const REPAINTED = `document.querySelector(`
    + `'#command-palette-listbox [data-painted]') === null`;

// The seeded idea is in the empty query's index too, so
// the answer has painted only once the list was painted
// again and differs from that index.
async function typeIdeaTypo(
    page: Page, today: string,
): Promise<void> {
    await markItems(page);
    await typeInPalette(page, IDEA_TYPO);
    await page.until(
        `${REPAINTED} && ${hasItem(IDEA_ITEM)}`
            + ` && ${ITEM_IDS} !== ${JSON.stringify(today)}`,
        'the matched idea',
    );
}

// The page's organization QUERYs, held at the browser's
// network layer while fn runs; every other request
// passes.
function holdQueries(
    page: Page, fn: (hold: RequestHold) => Promise<void>,
): Promise<void> {
    return withHeldRequests(
        page,
        '*/api/organizations/*',
        (request) => request.method === 'QUERY',
        fn,
    );
}

Deno.test(
    'a typo finds a seeded idea',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const today = await openPalette(page, origin);
                await typeIdeaTypo(page, today);
            },
        );
    },
);

Deno.test(
    "whitespace shows the empty query's index",
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const today = await openPalette(page, origin);
                await typeIdeaTypo(page, today);
                await typeInPalette(page, '   ');
                await page.until(
                    `${ITEM_IDS} === ${JSON.stringify(today)}`,
                    "the empty query's index",
                );
            },
        );
    },
);

Deno.test(
    'an answer for replaced text does not repaint',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openPalette(page, origin);
                await holdQueries(page, async (hold) => {
                    await typeInPalette(page, IDEA_TYPO);
                    const replaced = await hold.next();
                    await typeInPalette(page, PAGE_TYPO);
                    const current = await hold.next();
                    await markItems(page);
                    await hold.release(current);
                    await page.until(
                        REPAINTED, "the current text's answer",
                    );
                    const painted = await itemIds(page);
                    assert(painted.length > 0);
                    assert(!painted.includes(IDEA_ITEM));
                    await hold.release(replaced);
                    await stays(page, ITEM_IDS, SETTLE_MS);
                    assertStrictEquals(
                        await page.evaluate<string>(ITEM_IDS),
                        JSON.stringify(painted),
                    );
                });
            },
        );
    },
);

Deno.test(
    'a failed QUERY paints the load error',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openPalette(page, origin);
                await holdQueries(page, async (hold) => {
                    await typeInPalette(page, IDEA_TYPO);
                    await hold.fail(await hold.next());
                    await page.until(
                        `document.querySelector(`
                        + `'#command-palette-listbox`
                        + ` .command-palette-empty')`
                        + `?.textContent.includes(`
                        + `'failed to load') === true`,
                        'the load error',
                    );
                    assertStrictEquals(
                        (await itemIds(page)).length, 0,
                    );
                });
            },
        );
    },
);

Deno.test(
    'closing before the pause sends no QUERY',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openPalette(page, origin);
                await holdQueries(page, async (hold) => {
                    await typeInPalette(page, IDEA_TYPO);
                    await pressHotkey(page);
                    await new Promise((resolve) =>
                        setTimeout(resolve, SETTLE_MS));
                    assertStrictEquals(hold.heldCount(), 0);
                });
            },
        );
    },
);

Deno.test(
    'an answer landing after close does not repaint',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openPalette(page, origin);
                await holdQueries(page, async (hold) => {
                    await typeInPalette(page, IDEA_TYPO);
                    const inFlight = await hold.next();
                    await pressHotkey(page);
                    await markItems(page);
                    await hold.release(inFlight);
                    await stays(page, REPAINTED, SETTLE_MS);
                    assertStrictEquals(
                        await page.evaluate<boolean>(REPAINTED),
                        false,
                    );
                });
            },
        );
    },
);
