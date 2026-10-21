import { assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    useBrowser, withAdminPage, stays, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';
import { buildPageUrl } from
    '../../web-app/app/navigation.ts';

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

Deno.test(
    'adding a service member toasts success and lists it',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAddMember(
                    page, origin.baseUrl,
                );
                await page.click(
                    '#add-member-kind-toggle'
                    + ' input[value="service"]',
                );
                await page.until(
                    `document.querySelector(`
                    + `'#add-member-service-form')`
                    + `?.checkVisibility() === true`,
                    'service form visible',
                );
                await page.evaluate(`(() => {
                    window.__faStay = true;
                    document.querySelector(
                        '#service-name',
                    ).value = 'CI bot';
                    document.querySelector(
                        '#service-description',
                    ).value = 'Builds every commit';
                    return true;
                })()`);
                await page.click('#add-member-submit');
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Service member added'))`,
                    'Service member added toast',
                );
                await page.until(
                    `!document.querySelector(`
                    + `'#add-member-dialog[open]')`,
                    'dialog closed',
                );
                await page.until(
                    `document.body.textContent`
                    + `.includes('CI bot')`,
                    'roster shows CI bot',
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

Deno.test(
    'removing a service member drops it from the roster',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openAddMember(
                    page, origin.baseUrl,
                );
                await page.click(
                    '#add-member-kind-toggle'
                    + ' input[value="service"]',
                );
                await page.until(
                    `document.querySelector(`
                    + `'#add-member-service-form')`
                    + `?.checkVisibility() === true`,
                    'service form visible',
                );
                await page.evaluate(`(() => {
                    document.querySelector(
                        '#service-name',
                    ).value = 'CI bot';
                    document.querySelector(
                        '#service-description',
                    ).value = 'Builds every commit';
                    return true;
                })()`);
                await page.click('#add-member-submit');
                await page.until(
                    `!document.querySelector(`
                    + `'#add-member-dialog[open]')`,
                    'dialog closed',
                );
                await page.until(
                    `document.body.textContent`
                    + `.includes('CI bot')`,
                    'roster shows CI bot',
                );
                const memberId = await page.evaluate<string>(
                    `[...document.querySelectorAll(`
                    + `'[data-member-id]')].find(row =>`
                    + ` row.textContent.includes('CI bot'))`
                    + `.getAttribute('data-member-id')`,
                );
                const row = '[data-member-id="' + memberId + '"]';
                // Compositor click uses viewport coords; the
                // SERVICES section sits below the 800px fold.
                await page.evaluate(`document.querySelector(${
                    JSON.stringify(row)
                }).scrollIntoView({block: 'center'})`);
                await page.click(row);
                await page.ready('member-detail');
                const identityLink = 'a[href="' + buildPageUrl(
                    'identity-detail', { identityId: memberId },
                ) + '"]';
                await page.until(
                    `document.querySelector(${
                        JSON.stringify(identityLink)
                    })?.checkVisibility() === true`,
                    'identity link visible',
                );
                // The click-navigation from the roster runs a
                // cross-document view transition; while it
                // plays, a pointer reaches only <html>
                // (measured: elementFromPoint at the button's
                // centre), so wait until Remove is reachable.
                await page.until(
                    `(() => {
                        const btn = document.querySelector(
                            '#member-remove-btn');
                        if (!btn) return false;
                        const b = btn.getBoundingClientRect();
                        const hit = document.elementFromPoint(
                            b.x + b.width / 2,
                            b.y + b.height / 2);
                        return hit !== null
                            && hit.closest('#member-remove-btn')
                                === btn;
                    })()`,
                    'Remove reachable',
                );
                await page.click('#member-remove-btn');
                await page.waitFor('#confirm-remove-dialog[open]');
                await page.click(
                    '[data-member-action="confirm-remove"]',
                );
                await page.until(
                    `[...document.querySelectorAll(`
                    + `'.toast')].some(t => t.textContent`
                    + `.includes('Member removed'))`,
                    'Member removed toast',
                );
                await page.navigate(
                    registryUrl(origin.baseUrl, 'members'),
                );
                await page.ready('members');
                await page.until(
                    `document.querySelectorAll(`
                    + `'[data-member-id]').length > 0`,
                    'roster rendered',
                );
                assertStrictEquals(
                    await page.evaluate<boolean>(
                        `document.body.textContent`
                        + `.includes('CI bot')`,
                    ),
                    false,
                );
            },
        );
    },
);
