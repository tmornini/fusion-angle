import { assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    useBrowser, withAdminPage, stays, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const STAY_MS = 1500;
const MARKER = 'window.__faStay === true';
const ERROR_TOASTS =
    'document.querySelectorAll(".toast-error").length';
const JORDAN = 'Jordan Rivera';
const JORDAN_EMAIL = 'jordan.rivera@company.com';

async function openAddMember(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(
        registryUrl(baseUrl, 'members'),
    );
    await page.ready('members');
    await page.click(
        '[data-dialog-open="add-member"]',
    );
    await page.waitFor('#add-member-dialog[open]');
}

Deno.test(
    'adding a human member toasts success and stays (AA5)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAddMember(
                    page, origin.baseUrl,
                );
                await page.evaluate(`(() => {
                    window.__faStay = true;
                    document.querySelector('#hw-name')
                        .value = ${JSON.stringify(JORDAN)};
                    document.querySelector('#hw-email')
                        .value = ${
                            JSON.stringify(JORDAN_EMAIL)
                        };
                    document.querySelector('#hw-title')
                        .value = 'QA Lead';
                    document.querySelector(
                        '#hw-department',
                    ).value = 'Operations';
                    return true;
                })()`);
                await page.click('#add-member-submit');
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Member added'))`,
                    'Member added toast',
                );
                await page.until(
                    `!document.querySelector(`
                    + `'#add-member-dialog[open]')`,
                    'dialog closed',
                );
                await page.until(
                    `document.body.textContent.includes(`
                    + `${JSON.stringify(JORDAN)})`,
                    'roster shows Jordan Rivera',
                );
                await stays(page, MARKER, STAY_MS);
                await stays(page, ERROR_TOASTS, STAY_MS);
                assertStrictEquals(
                    await page.evaluate<number>(
                        ERROR_TOASTS,
                    ),
                    0,
                );
                assertEquals(
                    await page.evaluate<boolean>(MARKER),
                    true,
                );
            },
        );
    },
);
