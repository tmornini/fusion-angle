import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import { CANVAS, ONBOARDING, WRAP, openFlow } from
    './canvas.ts';

const browser = useBrowser();
const AUTO_FIT = '#flow-auto-fit-switch';
const PAN_ON =
    `document.querySelector('${WRAP}')`
    + `.classList.contains('flow-pan-cursor')`;
const AUTOFIT_TOAST = 'Disable Auto-Fit to change the view';

async function focusCanvas(page: Page): Promise<void> {
    await page.evaluate(
        `document.querySelector('${CANVAS}').focus()`,
    );
}

test('Space under Auto-Fit toasts and does not enter pan',
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
        assert.equal(await page.evaluate<boolean>(PAN_ON), false);
    });
});

test('Space toggles pan mode and a drag pans the viewBox',
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
