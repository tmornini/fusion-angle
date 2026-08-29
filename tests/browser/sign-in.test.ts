import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    ADMIN_EMAIL,
    passwordOf,
    signIn,
    startOrigin,
    useBrowser,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();

test('sign-in lands on the dashboard as the seeded admin',
async () => {
    const origin = await startOrigin();
    const page = await browser.get().newPage();
    try {
        await signIn(page, origin, ADMIN_EMAIL);
        const path = await page.evaluate<string>(
            'location.pathname',
        );
        assert.ok(path.includes('/dashboard/'), path);
        const name = await page.until<string>(
            `document.querySelector('#sidebar-member-name')
                ?.textContent?.trim() || null`,
            'sidebar member name',
        );
        assert.equal(name, 'Tony Stark');
    } finally {
        try {
            await browser.get()
                .disposeContext(page.contextId);
        } finally {
            await origin.close();
        }
    }
});

test('a wrong password stays on auth with the inline error',
async () => {
    const origin = await startOrigin();
    const page = await browser.get().newPage();
    try {
        await page.navigate(
            registryUrl(origin.baseUrl, 'auth'),
        );
        await page.waitFor('#email');
        const right = passwordOf(
            origin.credentials, ADMIN_EMAIL,
        );
        await page.evaluate(`(() => {
            const email = document.querySelector('#email');
            const password =
                document.querySelector('#password');
            email.value = ${JSON.stringify(ADMIN_EMAIL)};
            email.dispatchEvent(
                new Event('input', { bubbles: true }));
            password.value = ${JSON.stringify(
                right + 'x')};
            password.dispatchEvent(
                new Event('input', { bubbles: true }));
            return true;
        })()`);
        await page.click('#submit-btn');
        const error = await page.until<string>(
            `document.querySelector(
                '#password-error:not(.hidden)')
                ?.textContent?.trim() || null`,
            'password error',
        );
        assert.ok(error.length > 0);
        assert.ok((await page.evaluate<string>(
            'location.pathname',
        )).includes('/auth/'));
    } finally {
        try {
            await browser.get()
                .disposeContext(page.contextId);
        } finally {
            await origin.close();
        }
    }
});
