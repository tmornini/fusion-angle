import { assert, assertStrictEquals } from '@std/assert';
import { buildMembers } from
    '../../api/mock-data/members.ts';
import {
    getWorkOrders,
    isClaimedAndUnlapsed,
    putWorkOrderClaim,
    queryWorkOrders,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';
import { inPageContext } from '../in-page-facade.ts';
import {
    ADMIN_EMAIL,
    adminToken,
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
import { pollUntil } from '../../web-app/app/cdp-client.ts';

const browser = useBrowser();

// A margin for an answer to land and paint.
const SETTLE_MS = 600;

// In the mock data, "capture" matches four of the
// admin's available work orders — those sitting in Data
// Capture — so it narrows both lists without emptying
// them. Each test checks the cards against a fresh
// QUERY answer for the term, not the literal text.
const TERM = 'capture';
const CAPTURED = [
    'gButmqAicxcpsNuiTYQNKA', 'AbRcGuaSMFbUfPAexnegfw',
];
const NOT_CAPTURED = 'cHhNpUQxX6iZyLZ6N6PLzQ';
const WRITE_TIMEOUT_MS = 10_000;

function adminId(): string {
    const admin = buildMembers().find(
        (m) => m.email === ADMIN_EMAIL,
    );
    assert(admin !== undefined);
    return admin.id;
}

async function adminContext(
    origin: Origin,
): Promise<RequestContext> {
    return inPageContext(origin.db, await adminToken());
}

async function workOrderOf(
    ctx: RequestContext,
    workOrderId: string,
): Promise<WorkOrder> {
    const found = (await getWorkOrders(ctx)).find(
        (wo) => wo.id === workOrderId,
    );
    assert(found !== undefined, workOrderId);
    return found;
}

async function claim(
    ctx: RequestContext,
    workOrderId: string,
): Promise<void> {
    await putWorkOrderClaim(
        ctx, await workOrderOf(ctx, workOrderId),
    );
}

async function matchedIds(
    ctx: RequestContext,
): Promise<Set<string>> {
    return new Set(
        (await queryWorkOrders(ctx, TERM)).map((wo) => wo.id),
    );
}

function idsOf(list: string): string {
    return `JSON.stringify([...document.querySelectorAll(`
        + `'#${list} [data-work-order-card]')]`
        + `.map(c => c.getAttribute(`
        + `'data-work-order-card')))`;
}

const BOTH_LISTS = `JSON.stringify([${
    idsOf('available-list')}, ${idsOf('claimed-list')}])`;

async function listIds(
    page: Page, list: string,
): Promise<string[]> {
    return JSON.parse(
        await page.evaluate<string>(idsOf(list)),
    );
}

async function openWorkbox(
    page: Page, origin: Origin,
): Promise<void> {
    await page.navigate(
        registryUrl(origin.baseUrl, 'workbox'),
    );
    await page.ready('workbox');
    await page.until(
        `document.querySelectorAll(`
        + `'#available-list [data-work-order-card]')`
        + `.length > 0`,
        'available cards',
    );
}

function typeExpression(text: string): string {
    return `(() => {
        const box = document.getElementById(
            'workbox-search');
        box.value = ${JSON.stringify(text)};
        box.dispatchEvent(
            new Event('input', { bubbles: true }));
    })()`;
}

async function typeInBox(
    page: Page, text: string,
): Promise<void> {
    await page.evaluate(typeExpression(text));
}

// The answer has painted once every available card is
// one of its matches.
async function untilNarrowed(
    page: Page, matched: ReadonlySet<string>,
): Promise<void> {
    const ids = JSON.stringify([...matched]);
    await page.until(
        `(() => {
            const matched = new Set(${ids});
            const cards = [...document.querySelectorAll(
                '#available-list [data-work-order-card]')];
            return cards.length > 0 && cards.every(c =>
                matched.has(c.getAttribute(
                    'data-work-order-card')));
        })()`,
        'available narrowed to the answer',
    );
}

// The page's work-orders QUERYs, held at the browser's
// network layer while fn runs; every other request
// passes.
function holdQueries(
    page: Page, fn: (hold: RequestHold) => Promise<void>,
): Promise<void> {
    return withHeldRequests(
        page,
        '*/work-orders/*',
        (request) => request.method === 'QUERY',
        fn,
    );
}

function cardSelector(id: string): string {
    return `[data-work-order-card="${id}"]`;
}

// A long list puts most rows below the fold: scroll the row
// into view, click it, and wait for its claim button.
async function openRow(page: Page, id: string): Promise<void> {
    const selector = JSON.stringify(cardSelector(id));
    await page.evaluate(
        `document.querySelector(${selector})`
        + `.scrollIntoView({ block: 'center' })`,
    );
    await page.click(cardSelector(id));
    await page.until(
        `document.querySelector(`
        + `'#work-order-header .badge-neutral')`
        + `?.textContent.includes(${JSON.stringify(id)})`
        + ` && document.getElementById(`
        + `'work-order-claim-btn') !== null`,
        'the box holds ' + id,
    );
}

Deno.test('the search narrows both lists', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const ctx = await adminContext(origin);
        await claim(ctx, CAPTURED[0]!);
        await claim(ctx, NOT_CAPTURED);
        await openWorkbox(page, origin);
        await page.until(
            `document.querySelectorAll(`
            + `'#claimed-list [data-work-order-card]')`
            + `.length === 2`,
            'two claimed cards',
        );
        const before = {
            available: await listIds(page, 'available-list'),
            claimed: await listIds(page, 'claimed-list'),
        };
        const matched = await matchedIds(ctx);
        await typeInBox(page, TERM);
        await untilNarrowed(page, matched);
        await page.until(
            `document.querySelectorAll(`
            + `'#claimed-list [data-work-order-card]')`
            + `.length === 1`,
            'one claimed match',
        );
        const after = {
            available: await listIds(page, 'available-list'),
            claimed: await listIds(page, 'claimed-list'),
        };
        for (const id of [...after.available, ...after.claimed]) {
            assert(matched.has(id), id);
        }
        assert(after.available.length < before.available.length);
        assert(after.claimed.length < before.claimed.length);
    });
});

Deno.test('Escape clears the filter', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const ctx = await adminContext(origin);
        await openWorkbox(page, origin);
        const today = await page.evaluate<string>(BOTH_LISTS);
        await typeInBox(page, TERM);
        await untilNarrowed(page, await matchedIds(ctx));
        assert(
            await page.evaluate<string>(BOTH_LISTS) !== today,
        );
        await page.click('#workbox-search');
        await page.key('Escape');
        await page.until(
            `${BOTH_LISTS} === ${JSON.stringify(today)}`,
            "today's lists",
        );
        assertStrictEquals(
            await page.evaluate<string>(
                `document.getElementById(`
                + `'workbox-search').value`,
            ),
            '',
        );
    });
});

Deno.test(
    'a stale answer does not repaint a cleared search',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openWorkbox(page, origin);
            const today = await page.evaluate<string>(
                BOTH_LISTS,
            );
            await holdQueries(page, async (hold) => {
                await typeInBox(page, TERM);
                const inFlight = await hold.next();
                // The cleared box's GET repaints the same
                // cards as new nodes; only once it has may
                // the old answer land.
                await page.evaluate(
                    `document.querySelectorAll(`
                    + `'#available-list `
                    + `[data-work-order-card]')`
                    + `.forEach(c => c.dataset.painted`
                    + ` = 'before')`,
                );
                await typeInBox(page, '');
                await page.until(
                    `document.querySelector(`
                    + `'#available-list `
                    + `[data-painted]') === null`
                    + ` && ${BOTH_LISTS} === ${
                        JSON.stringify(today)}`,
                    "today's lists repainted",
                );
                await hold.release(inFlight);
                await stays(page, BOTH_LISTS, SETTLE_MS);
                assertStrictEquals(
                    await page.evaluate<string>(BOTH_LISTS),
                    today,
                );
            });
        });
    },
);

Deno.test(
    'a claim during a QUERY still shows its answer',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            const claimedId = CAPTURED[0]!;
            await openWorkbox(page, origin);
            await openRow(page, claimedId);
            await holdQueries(page, async (hold) => {
                await typeInBox(page, TERM);
                await hold.next();
                await page.click('#work-order-claim-btn');
                await page.waitFor(
                    '#claimed-list ' + cardSelector(claimedId),
                );
                hold.stopHolding();
                await hold.releaseHeld();
                await untilNarrowed(page, await matchedIds(ctx));
                await page.waitFor(
                    '#claimed-list ' + cardSelector(claimedId),
                );
            });
        });
    },
);

Deno.test(
    'a pill after a failed QUERY keeps the error',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            await openWorkbox(page, origin);
            await holdQueries(page, async (hold) => {
                await typeInBox(page, TERM);
                await hold.release(await hold.next());
                await untilNarrowed(page, await matchedIds(ctx));
                // The same text again: the answer on hand is
                // for it, and this QUERY fails.
                await typeInBox(page, TERM + ' ');
                await hold.fail(await hold.next());
                await page.waitFor(
                    '#work-order-lists [data-retry-btn]',
                );
                await page.click(
                    '[data-workbox-pill="archivedByMe"]',
                );
                const rerun = await hold.next();
                assert(await page.evaluate<boolean>(
                    `!!document.querySelector(`
                    + `'#work-order-lists [data-retry-btn]')`,
                ));
                await hold.release(rerun);
                await page.until(
                    `document.getElementById('archived-list')`
                    + `?.textContent.includes('No work orders`
                    + ` match “${TERM}”')`,
                    'the archived list answers',
                );
            });
        });
    },
);

Deno.test('the claim button claims while filtered', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const ctx = await adminContext(origin);
        await openWorkbox(page, origin);
        await typeInBox(page, TERM);
        await untilNarrowed(page, await matchedIds(ctx));
        const [id] = await listIds(page, 'available-list');
        assert(id !== undefined);
        await openRow(page, id);
        await page.click('#work-order-claim-btn');
        await page.waitFor('#claimed-list ' + cardSelector(id));
        const fresh = await pollUntil(
            'the claim saved', WRITE_TIMEOUT_MS,
            async () => {
                const wo = await workOrderOf(ctx, id);
                return isClaimedAndUnlapsed(wo.claim)
                    ? wo.claim
                    : false;
            },
        );
        assertStrictEquals(fresh.memberId, adminId());
    });
});

Deno.test(
    'on a phone the search follows the button',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.setViewport(375, 800, true);
            await openWorkbox(page, origin);
            assert(await page.until<boolean>(
                `(() => {
                    const actions = document.getElementById(
                        'workbox-header-actions');
                    const box = document.getElementById(
                        'workbox-search');
                    return (actions
                        .compareDocumentPosition(box)
                        & Node.DOCUMENT_POSITION_FOLLOWING)
                        !== 0;
                })()`,
                'box after the button',
            ));
        });
    },
);
