import { assert } from '@std/assert';
import { useBrowser, withAdminPage } from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const SIDEBAR_TRANSITION =
    `getComputedStyle(document.querySelector('#desktop-sidebar'))`
    + `.transitionDuration`;

function seconds(v: string): number {
    return v.endsWith('ms')
        ? Number(v.slice(0, -2)) / 1000
        : Number(v.slice(0, -1));
}

Deno.test('reduced motion clamps every transition to 0.01ms',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(registryUrl(origin.baseUrl, 'dashboard'));
        await page.ready('dashboard');
        assert(seconds(await page.evaluate<string>(
            SIDEBAR_TRANSITION)) >= 0.1);
        await page.emulateMedia([
            { name: 'prefers-reduced-motion', value: 'reduce' },
        ]);
        await page.until(
            `matchMedia('(prefers-reduced-motion: reduce)').matches`,
            'media emulated',
        );
        assert(seconds(await page.evaluate<string>(
            SIDEBAR_TRANSITION)) < 0.001);
    });
});
