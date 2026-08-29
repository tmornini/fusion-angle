import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const WIDTH =
    `getComputedStyle(document.querySelector('#desktop-sidebar'))`
    + `.width`;

test('collapse and expand transition the sidebar width',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert.equal(await page.evaluate<string>(WIDTH), '256px');
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '64px'`, 'collapsed to 4rem');
        assert.equal(await page.evaluate<boolean>(
            `document.documentElement.classList`
            + `.contains('sidebar-collapsed')`,
        ), true);
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text')`
            + `.checkVisibility()`,
        ), false);
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '256px'`, 'expanded to 16rem');
        assert.equal(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text')`
            + `.checkVisibility()`,
        ), true);
    });
});
