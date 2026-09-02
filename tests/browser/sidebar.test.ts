import { assertStrictEquals } from '@std/assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const WIDTH =
    `getComputedStyle(document.querySelector('#desktop-sidebar'))`
    + `.width`;

Deno.test('collapse and expand transition the sidebar width',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assertStrictEquals(await page.evaluate<string>(WIDTH), '256px');
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '64px'`, 'collapsed to 4rem');
        assertStrictEquals(await page.evaluate<boolean>(
            `document.documentElement.classList`
            + `.contains('sidebar-collapsed')`,
        ), true);
        assertStrictEquals(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text')`
            + `.checkVisibility()`,
        ), false);
        await page.click('#sidebar-toggle');
        await page.until(`${WIDTH} === '256px'`, 'expanded to 16rem');
        assertStrictEquals(await page.evaluate<boolean>(
            `document.querySelector('.sidebar-nav-text')`
            + `.checkVisibility()`,
        ), true);
    });
});
