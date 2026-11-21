import { assert, assertStrictEquals } from '@std/assert';
import {
    SEED_RECORD_TYPE_ID,
} from '../../api/mock-data/seed-message-pairs.ts';
import {
    useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const NAME_TOAST = 'Record name is required';

async function openRecord(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(
        registryUrl(
            baseUrl, 'record-detail',
            'id=' + SEED_RECORD_TYPE_ID,
        ),
    );
    await page.ready('record-detail');
    await page.waitFor('#record-edit-btn');
}

async function clearRecordName(
    page: Page,
): Promise<void> {
    await page.evaluate(`(() => {
        const name = document.querySelector(
            '#record-edit-name');
        name.value = '';
        name.dispatchEvent(
            new Event('input', { bubbles: true }));
    })()`);
}

function nameToastCount(): string {
    return `(() => {
        const n = [...document.querySelectorAll(
            '.toast')].filter(t =>
            (t.textContent || '').includes(${
                JSON.stringify(NAME_TOAST)
            })).length;
        return n > 0 ? n : null;
    })()`;
}

Deno.test(
    'cancel returns to reading on the same record',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openRecord(
                    page, origin.baseUrl,
                );
                await page.click('#record-edit-btn');
                await page.waitFor(
                    '#record-cancel-btn',
                );
                await page.click('#record-cancel-btn');
                const path = await page.evaluate<string>(
                    'location.pathname',
                );
                assert(
                    path.endsWith(
                        '/records/detail.html',
                    ),
                    'cancel left the record for '
                    + path,
                );
                assert(
                    await page.evaluate<boolean>(
                        '!!document.querySelector('
                        + '"#record-edit-btn")'
                        + ' && !document.querySelector('
                        + '"#record-cancel-btn")',
                    ),
                );
            },
        );
    },
);

Deno.test(
    'an empty record name toasts once',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openRecord(
                    page, origin.baseUrl,
                );
                await page.click('#record-edit-btn');
                await page.waitFor(
                    '#record-edit-name',
                );
                await clearRecordName(page);
                await page.click('#record-save-btn');
                const count = await page.until<number>(
                    nameToastCount(),
                    'record name toast',
                );
                assertStrictEquals(count, 1);
                const path = await page.evaluate<string>(
                    'location.pathname',
                );
                assert(
                    path.endsWith(
                        '/records/detail.html',
                    ),
                    'save left the record for '
                    + path,
                );
            },
        );
    },
);
