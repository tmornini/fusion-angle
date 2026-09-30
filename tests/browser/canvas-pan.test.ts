import { assertStrictEquals } from '@std/assert';
import {
    stays, useBrowser, withAdminPage,
    type Page, type Point,
} from './fixtures.ts';
import {
    CANVAS, EDGE, LAYOUT_TEST, ONBOARDING, WRAP,
    openFlow, doubleClick, edgeCount, edgeLabelSelector,
    nodeIdNamed, nodeSelector,
} from './canvas.ts';

const browser = useBrowser();
const AUTO_FIT = '#flow-auto-fit-switch';
const PAN_ON =
    `document.querySelector('${WRAP}')`
    + `.classList.contains('flow-pan-cursor')`;
const AUTOFIT_TOAST = 'Disable Auto-Fit to change the view';
const STAY_MS = 600;
const PANEL_ABSENT =
    `document.querySelector('.flow-props-panel')`
    + ` === null`;
const VIEWBOX_OF =
    `document.querySelector('${CANVAS}')`
    + `.getAttribute('viewBox')`;
const ZOOM_IN = '[data-action="zoom-in"]';
const DELETE_SELECTED = '[data-action="delete-selected"]';
const EMPTY_INSET_PX = 20;

// A canvas point with nothing under it: the four inset
// corners, first empty one wins. A node or edge under
// the point would make the click a selection, not the
// empty-canvas case.
async function emptyCanvasPoint(
    page: Page,
): Promise<Point> {
    const svg = await page.rect(CANVAS);
    const left = svg.x + EMPTY_INSET_PX;
    const right = svg.x + svg.width - EMPTY_INSET_PX;
    const top = svg.y + EMPTY_INSET_PX;
    const bottom = svg.y + svg.height - EMPTY_INSET_PX;
    const corners: Point[] = [
        { x: right, y: top },
        { x: left, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];
    for (const pt of corners) {
        const isEmpty = await page.evaluate<boolean>(
            `(() => {
                const el = document.elementFromPoint(
                    ${pt.x}, ${pt.y});
                return el !== null
                    && el.closest('${CANVAS}') !== null
                    && el.closest(
                        '[data-node-id], [data-edge-id]',
                    ) === null;
            })()`,
        );
        if (isEmpty) return pt;
    }
    throw new Error('no empty canvas corner');
}

// Zoom in once, then click empty canvas: the click
// must leave the zoomed camera exactly where it was.
async function assertEmptyClickKeepsZoom(
    page: Page,
): Promise<void> {
    const before = await page.evaluate<string | null>(
        VIEWBOX_OF,
    );
    await page.click(ZOOM_IN);
    await page.until(
        `${VIEWBOX_OF} !== ${JSON.stringify(before)}`,
        'viewBox zoomed',
    );
    const zoomed = await page.evaluate<string | null>(
        VIEWBOX_OF,
    );
    const pt = await emptyCanvasPoint(page);
    await page.press(pt);
    await page.release(pt);
    assertStrictEquals(
        await page.evaluate<string | null>(VIEWBOX_OF),
        zoomed,
    );
}

async function focusCanvas(page: Page): Promise<void> {
    await page.evaluate(
        `document.querySelector('${CANVAS}').focus()`,
    );
}

Deno.test('Space under Auto-Fit toasts and does not enter pan',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        await focusCanvas(page);
        await page.key(' ');
        await page.until(
            `[...document.querySelectorAll('.toast')]`
            + `.some(t => t.textContent.includes(`
            + `${JSON.stringify(AUTOFIT_TOAST)}))`,
            'auto-fit toast',
        );
        assertStrictEquals(await page.evaluate<boolean>(PAN_ON), false);
    });
});

Deno.test('Space toggles pan mode and a drag pans the viewBox',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openFlow(page, origin, ONBOARDING);
        await page.click(AUTO_FIT);
        await focusCanvas(page);
        await page.key(' ');
        await page.until(PAN_ON, 'pan cursor on');
        const before = await page.evaluate<string>(
            `document.querySelector('${CANVAS}')`
            + `.getAttribute('viewBox')`,
        );
        const svg = await page.rect(CANVAS);
        const from = { x: svg.x + svg.width - 20, y: svg.y + 20 };
        await page.drag(from, { x: from.x - 120, y: from.y + 60 });
        await page.until(
            `document.querySelector('${CANVAS}')`
            + `.getAttribute('viewBox') !== ${JSON.stringify(before)}`,
            'viewBox panned',
        );
        await focusCanvas(page);
        await page.key(' ');
        await page.until(`!(${PAN_ON})`, 'pan cursor off');
    });
});

Deno.test(
    'Space on a focused node toggles pan off'
    + ' and does not open the panel (F12)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                await page.click(AUTO_FIT);
                await focusCanvas(page);
                await page.key(' ');
                await page.until(
                    PAN_ON, 'pan cursor on',
                );
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                await page.evaluate(
                    `document.querySelector(${
                        JSON.stringify(
                            nodeSelector(review),
                        )
                    }).focus()`,
                );
                await page.key(' ');
                await page.until(
                    `!(${PAN_ON})`,
                    'pan cursor off',
                );
                await stays(
                    page, PANEL_ABSENT, STAY_MS,
                );
            },
        );
    },
);

Deno.test(
    'Zoom-in viewBox survives panel open and close'
    + ' with Auto Fit off (F14)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, ONBOARDING,
                );
                await page.click(AUTO_FIT);
                const viewBoxOf =
                    `document.querySelector('${CANVAS}')`
                    + `.getAttribute('viewBox')`;
                const before = await page.evaluate<
                    string | null
                >(viewBoxOf);
                await page.click(
                    '[data-action="zoom-in"]',
                );
                await page.until(
                    `${viewBoxOf} !== ${
                        JSON.stringify(before)
                    }`,
                    'viewBox zoomed',
                );
                const zoomed = await page.evaluate<
                    string | null
                >(viewBoxOf);
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                await doubleClick(
                    page, nodeSelector(review),
                );
                await page.waitFor('.flow-props-panel');
                await page.key('Escape');
                await page.until(
                    PANEL_ABSENT,
                    'panel closed',
                );
                assertStrictEquals(
                    await page.evaluate<string | null>(
                        viewBoxOf,
                    ),
                    zoomed,
                );
            },
        );
    },
);

Deno.test(
    'An empty-canvas click after deleting the open'
    + ' edge keeps the zoomed viewBox (F29)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(
                    page, origin, LAYOUT_TEST,
                );
                await page.click(AUTO_FIT);
                const label = edgeLabelSelector();
                await page.waitFor(label);
                const edges = await edgeCount(page);
                await doubleClick(page, label);
                await page.waitFor('.flow-props-panel');
                await page.click(DELETE_SELECTED);
                await page.until(
                    `document.querySelectorAll('${EDGE}')`
                    + `.length === ${edges - 1}`,
                    'one fewer edge',
                );
                await page.until(
                    PANEL_ABSENT, 'panel gone',
                );
                await assertEmptyClickKeepsZoom(page);
            },
        );
    },
);
