import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    stays,
    useBrowser,
    withAdminPage,
    type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const CARD = '[data-project-card]';
const HANDLE = '[data-project-card] .drag-handle';
const ORDER = `[...document.querySelectorAll('${CARD}')]`
    + `.map(c => c.getAttribute('data-project-card'))`;
const STAY_MS = 600;

async function openProjects(
    page: Page, baseUrl: string,
): Promise<string[]> {
    await page.navigate(registryUrl(baseUrl, 'projects'));
    await page.ready('projects');
    await page.waitFor(HANDLE);
    const order = await page.evaluate<string[]>(ORDER);
    assert.ok(order.length >= 3, 'three or more projects');
    return order;
}

function onProjects(path: string): boolean {
    return path.endsWith('/projects/index.html');
}

test('a captured drag reorders, persists, and stays put',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const before = await openProjects(page, origin.baseUrl);
        const handle = await page.center(HANDLE);
        const second = await page.rect(CARD, 1);
        await page.drag(handle, {
            x: handle.x,
            y: second.y + second.height * 0.8,
        });
        await page.until(
            `(${ORDER})[1] === ${JSON.stringify(before[0])}`,
            'first card lands in the second slot',
        );
        await stays(page, 'location.pathname', STAY_MS);
        assert.ok(onProjects(
            await page.evaluate<string>('location.pathname'),
        ));
        const after = await openProjects(page, origin.baseUrl);
        assert.equal(after[0], before[1]);
        assert.equal(after[1], before[0]);
    });
});

test('a plain click on the reorder handle does not navigate',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openProjects(page, origin.baseUrl);
        await page.click(HANDLE);
        await stays(page, 'location.pathname', STAY_MS);
        assert.ok(onProjects(
            await page.evaluate<string>('location.pathname'),
        ));
    });
});

test('arrow keys on a focused handle move the card',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const before = await openProjects(page, origin.baseUrl);
        await page.evaluate(
            `document.querySelector('${HANDLE}').focus()`,
        );
        await page.key('ArrowDown');
        await page.until(
            `(${ORDER})[1] === ${JSON.stringify(before[0])}`,
            'card moves down one slot',
        );
        const live = await page.evaluate<string>(
            `document.querySelector('[aria-live="polite"].sr-only')
                ?.textContent ?? ''`,
        );
        assert.ok(live.startsWith('Moved to position 2 of '), live);
    });
});
