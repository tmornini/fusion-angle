import { assert } from '@std/assert';
import {
    stays,
    startOrigin,
    useBrowser,
} from './fixtures.ts';

const browser = useBrowser();

Deno.test(
    'unsigned landing stays and signs in',
async () => {
    const origin = await startOrigin();
    try {
        const page = await browser.get().newPage();
        try {
            await page.navigate(
                origin.baseUrl + '/landing/index.html',
            );
            await page.waitFor('[data-goto-auth]');
            await stays(
                page, 'location.pathname', 3_000,
            );
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
