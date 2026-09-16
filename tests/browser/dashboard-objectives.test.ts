import { assertStrictEquals } from '@std/assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
// A seeded approved, baseline-scored Stark project: its
// actual sliders are live on first paint.
const CUSTOMER_SEGMENTATION = 'wqGTTFdYUGnmBxWCppmkOQ';
const LOWER_EXPENSES = 'JobGWBxUTEBusPcVhYEKtA';
const ROW = `.score-row[data-objective-id="${LOWER_EXPENSES}"]`;
const DOTS =
    `document.querySelectorAll('${ROW} .spark-dot').length`;
const SLIDER = `#objective-slider-${LOWER_EXPENSES}`;
const SAVE = '[data-action="save-objectives"]';

Deno.test(
    'a Save in another same-jar tab adds a point to the'
    + ' dashboard Objectives box without a reload (K29)',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.navigate(
                registryUrl(origin.baseUrl, 'dashboard'),
            );
            await page.ready('dashboard');
            await page.waitFor(`${ROW} .spark-dot`);
            const before = await page.evaluate<number>(DOTS);
            // Same browser context — same cookie jar — as
            // the dashboard tab; disposed with it.
            const other = await browser.get().newPageIn(
                page.contextId,
            );
            await other.navigate(registryUrl(
                origin.baseUrl, 'project-detail',
                'projectId=' + CUSTOMER_SEGMENTATION,
            ));
            await other.ready('project-detail');
            await other.waitFor(
                `${SLIDER}.actual-slider:not([disabled])`,
            );
            await other.evaluate(`(() => {
                const slider = document.querySelector(${
                    JSON.stringify(SLIDER)
                });
                slider.value = '-44';
                slider.dispatchEvent(
                    new Event('input', { bubbles: true }),
                );
                return true;
            })()`);
            await other.until(
                `!document.querySelector(${
                    JSON.stringify(SAVE)
                }).disabled`,
                'Save enabled',
            );
            // Compositor click uses viewport coords; Save
            // sits below the 800px fold on this page.
            await other.evaluate(`document.querySelector(${
                JSON.stringify(SAVE)
            }).scrollIntoView({block: 'center'})`);
            await other.click(SAVE);
            await page.until(
                `${DOTS} === ${before + 1}`,
                'one more trend point',
            );
            assertStrictEquals(
                await page.evaluate<number>(DOTS), before + 1,
            );
        });
    },
);
