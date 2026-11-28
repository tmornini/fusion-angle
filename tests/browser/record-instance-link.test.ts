import { assert } from '@std/assert';
import {
    SEED_INSTANCE_ID,
    SEED_RECORD_TYPE_ID,
} from '../../api/mock-data/seed-message-pairs.ts';
import {
    useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ROW = `.record-instance-row[data-instance-id="${
    SEED_INSTANCE_ID
}"]`;

async function openRecordDetail(
    page: Page, baseUrl: string, query: string,
): Promise<void> {
    await page.navigate(
        registryUrl(baseUrl, 'records', query),
    );
    await page.ready('records');
    await page.waitFor(ROW);
}

function rowTopFromViewport(page: Page): Promise<number> {
    return page.evaluate<number>(
        `document.querySelector(${JSON.stringify(ROW)})`
        + `.getBoundingClientRect().top`,
    );
}

Deno.test(
    'an instance link scrolls its row into view',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                // A short viewport puts the row well below
                // the fold, so the precondition holds with
                // room to spare.
                await page.setViewport(1280, 400, false);
                const viewportHeight =
                    await page.evaluate<number>(
                        'innerHeight',
                    );
                await openRecordDetail(
                    page, origin.baseUrl,
                    'id=' + SEED_RECORD_TYPE_ID,
                );
                const unlinkedTop =
                    await rowTopFromViewport(page);
                assert(
                    unlinkedTop >= viewportHeight,
                    `the row starts below the fold`
                    + ` (${unlinkedTop} vs`
                    + ` ${viewportHeight})`,
                );
                await openRecordDetail(
                    page, origin.baseUrl,
                    'id=' + SEED_RECORD_TYPE_ID
                    + '&instance=' + SEED_INSTANCE_ID,
                );
                const linkedTop =
                    await rowTopFromViewport(page);
                assert(
                    linkedTop >= 0
                    && linkedTop < viewportHeight,
                    `the linked row is in view`
                    + ` (${linkedTop} vs`
                    + ` ${viewportHeight})`,
                );
            },
        );
    },
);
