import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const MOBILE = { width: 375, height: 800 };

test('below 768px the drawer replaces the desktop sidebar',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.setViewport(MOBILE.width, MOBILE.height, true);
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('#desktop-sidebar')`
            + `.checkVisibility()`,
        ), false);
        assert.equal(await page.evaluate<boolean>(
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
