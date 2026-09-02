import { assertStrictEquals } from '@std/assert';
import {
    stays, useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import {
    CANVAS, ONBOARDING, WRAP, openFlow,
    doubleClick, nodeIdNamed, nodeSelector,
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
