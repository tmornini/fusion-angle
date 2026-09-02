import { assertStrictEquals } from '@std/assert';
import { useBrowser, withAdminPage, type Page } from
    './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const TOASTS = `document.querySelectorAll('.toast').length`;
const CLOSE_WINDOW_MS = 1500;
const MAX_TOASTS = 5;

async function blankInvite(page: Page): Promise<void> {
    await page.click('#invite-member-submit');
}

async function openInviteDialog(
    page: Page, baseUrl: string,
): Promise<void> {
    await page.navigate(registryUrl(baseUrl, 'members'));
    await page.ready('members');
    await page.click('[data-dialog-open="invite-member"]');
    await page.waitFor('#invite-member-dialog[open]');
}

Deno.test('the close button detaches a toast inside its fade',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openInviteDialog(page, origin.baseUrl);
        await blankInvite(page);
        await page.until(
            `[...document.querySelectorAll('.toast')]`
            + `.some(t => t.textContent.includes('Email is required'))`,
            'validation toast',
        );
        // A modal <dialog>'s top layer sits above ALL page
        // content regardless of z-index, including the fixed,
        // z-index'd #toast-container: elementFromPoint at the
        // close button's own centre returns the dialog, not
        // the button (measured, not theorised). No pointer can
        // reach the close button until the dialog closes, so
        // dismiss it with Escape, the native affordance for a
        // modal <dialog>, before clicking through.
        await page.key('Escape');
        await page.until(
            `!document.querySelector('#invite-member-dialog[open]')`,
            'dialog closed',
        );
        await page.click('.toast .toast-close');
        await page.until(
            `${TOASTS} === 0`, 'toast detached', CLOSE_WINDOW_MS,
        );
    });
});

Deno.test('the stack caps at five toasts',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openInviteDialog(page, origin.baseUrl);
        for (let i = 0; i < MAX_TOASTS + 2; i += 1) {
            await blankInvite(page);
        }
        const count = await page.until<number>(
            `(() => { const n = ${TOASTS}; `
            + `return n >= ${MAX_TOASTS} ? n : null; })()`,
            'stack filled',
        );
        assertStrictEquals(count, MAX_TOASTS);
    });
});
