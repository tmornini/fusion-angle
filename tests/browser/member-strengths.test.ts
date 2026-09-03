import { assertEquals } from '@std/assert';
import {
    useBrowser, withAdminPage, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ADMIN_MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const STRENGTHS =
    '#member-strengths .pill-tag-strength';
const NAMES = `[...document.querySelectorAll('${
    STRENGTHS
}')].map(el => (el.textContent ?? '')`
    + `.replace(/\\s+/g, ' ').trim())`;
const EXPECTED = [
    'Strategic Planning',
    'Stakeholder Management',
    'Agile Methods',
];

async function openAdminDetail(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(registryUrl(
        baseUrl,
        'member-detail',
        `memberId=${ADMIN_MEMBER_ID}`,
    ));
    await page.ready('member-detail');
    await page.waitFor('#member-edit-btn');
}

Deno.test(
    'chip toggles persist on save and reload (AA9)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAdminDetail(
                    page, origin.baseUrl,
                );
                await page.click('#member-edit-btn');
                await page.waitFor(
                    '[data-strength="Data Analysis"]',
                );
                await page.click(
                    '[data-strength="Data Analysis"]',
                );
                await page.until(
                    `!document.querySelector(`
                    + `'[data-strength="Data Analysis"]')`
                    + `.classList.contains('btn-primary')`,
                    'Data Analysis off',
                );
                await page.click(
                    '[data-strength="Agile Methods"]',
                );
                await page.until(
                    `document.querySelector(`
                    + `'[data-strength="Agile Methods"]')`
                    + `.classList.contains('btn-primary')`,
                    'Agile Methods on',
                );
                await page.click('#member-save-btn');
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Member saved'))`,
                    'Member saved toast',
                );
                await page.until(
                    `document.querySelector(`
                    + `'.strength-chip') === null`,
                    'read mode',
                );
                assertEquals(
                    await page.evaluate<string[]>(
                        NAMES,
                    ),
                    EXPECTED,
                );
                await openAdminDetail(
                    page, origin.baseUrl,
                );
                assertEquals(
                    await page.evaluate<string[]>(
                        NAMES,
                    ),
                    EXPECTED,
                );
            },
        );
    },
);
