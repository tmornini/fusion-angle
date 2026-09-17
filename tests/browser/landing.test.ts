import { assert, assertStrictEquals } from '@std/assert';
import {
    stays,
    startOrigin,
    useBrowser,
} from './fixtures.ts';
import { PILOT_SCHEDULING_URL } from
    '../../web-app/landing/index.ts';

const browser = useBrowser();

Deno.test(
    'unsigned landing stays, books, and signs in',
async () => {
    const origin = await startOrigin();
    try {
        const page = await browser.get().newPage();
        try {
            await page.navigate(
                origin.baseUrl + '/landing/index.html',
            );
            await page.waitFor('[data-book-pilot]');
            await stays(
                page, 'location.pathname', 3_000,
            );
            const hrefs = await page.evaluate<string[]>(
                `[...document.querySelectorAll(
                    '[data-book-pilot]')]
                    .map(a => a.getAttribute('href'))`,
            );
            assertStrictEquals(hrefs.length, 4);
            for (const href of hrefs) {
                assertStrictEquals(
                    href, PILOT_SCHEDULING_URL,
                );
            }
            await page.click('[data-goto-auth]');
            const path = await page.until<string>(
                `location.pathname.includes('/auth/')
                    ? location.pathname : null`,
                'auth path',
            );
            assert(path.includes('/auth/'), path);
        } finally {
            await browser.get()
                .disposeContext(page.contextId);
        }
    } finally {
        await origin.close();
    }
});
