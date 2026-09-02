import { assert, assertStrictEquals } from '@std/assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const MOBILE = { width: 375, height: 800 };
const NARROW = { width: 320, height: 800 };

Deno.test('below 768px the drawer replaces the desktop sidebar',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(MOBILE.width, MOBILE.height, true);
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assertStrictEquals(await page.evaluate<boolean>(
            `document.querySelector('#desktop-sidebar')`
            + `.checkVisibility()`,
        ), false);
        assertStrictEquals(await page.evaluate<boolean>(
            `document.querySelector('.mobile-header')`
            + `.checkVisibility()`,
        ), true);
        await page.setViewport(1280, 800, false);
        await page.until(
            `document.querySelector('#desktop-sidebar')`
            + `.checkVisibility()`,
            'desktop sidebar back',
        );
    });
});

Deno.test('a narrow phone still gets a sparkline track',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(
            NARROW.width, NARROW.height, true,
        );
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        await page.waitFor('.score-row-sparkline');
        const track = await page.rect('.score-row-sparkline');
        assert(
            track.width > 0,
            `sparkline track collapsed to ${track.width}px`,
        );
    });
});
