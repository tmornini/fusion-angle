import {
    assert,
    assertStrictEquals,
} from '@std/assert';
import {
    startOrigin,
    useBrowser,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();

const ROOM_H1 =
    '#api-room h1';

async function openDocs(
    hash: string,
): Promise<{
    origin: Awaited<ReturnType<typeof startOrigin>>;
    page: Awaited<
        ReturnType<
            ReturnType<typeof browser.get>['newPage']
        >
    >;
}> {
    const origin = await startOrigin();
    const page = await browser.get().newPage();
    const url = registryUrl(
        origin.baseUrl, 'api-documentation',
    ) + hash;
    await page.navigate(url);
    await page.ready('api-documentation');
    return { origin, page };
}

async function closeDocs(
    origin: Awaited<ReturnType<typeof startOrigin>>,
    page: Awaited<
        ReturnType<
            ReturnType<typeof browser.get>['newPage']
        >
    >,
): Promise<void> {
    await browser.get().disposeContext(
        page.contextId,
    );
    await origin.close();
}

Deno.test('api-documentation boots the elevation',
async () => {
    const { origin, page } = await openDocs('');
    try {
        const path = await page.evaluate<string>(
            'location.pathname',
        );
        assert(
            path.includes('/api-documentation/'),
            path,
        );
        assert(
            !(path.includes('/auth/')),
            path,
        );
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector('object')`
                + ` === null`,
            ),
            true,
        );
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#api-elevation svg')`
                + `?.checkVisibility() === true`,
            ),
            true,
        );
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#api-room')?.hidden === true`,
            ),
            true,
        );
    } finally {
        await closeDocs(origin, page);
    }
});

Deno.test('circle click paints a room',
async () => {
    const { origin, page } = await openDocs('');
    try {
        await page.click('#api-elevation a');
        const hash = await page.until<string>(
            `location.hash.length > 1`
            + ` ? location.hash : null`,
            'room hash after circle click',
        );
        assert(hash.startsWith('#'), hash);
        assert(
            !hash.endsWith('/'),
            hash,
        );
        const heading = await page.until<string>(
            `document.querySelector('${ROOM_H1}')`
            + `?.checkVisibility() === true`
            + ` ? document.querySelector('${ROOM_H1}')`
            + `.textContent.trim() : null`,
            'room heading after circle click',
        );
        assert(heading.length > 0, heading);
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#api-elevation')?.hidden === true`,
            ),
            true,
        );
    } finally {
        await closeDocs(origin, page);
    }
});

Deno.test('status hash and back walk the stack',
async () => {
    const { origin, page } = await openDocs('');
    try {
        await page.click('#api-elevation a');
        const roomHeading = await page.until<string>(
            `document.querySelector('${ROOM_H1}')`
            + `?.checkVisibility() === true`
            + ` ? document.querySelector('${ROOM_H1}')`
            + `.textContent.trim() : null`,
            'room heading before status',
        );
        await page.click(
            '#api-room a[href^="#statuses/"]',
        );
        const statusHeading = await page.until<string>(
            `document.querySelector('${ROOM_H1}')`
            + `?.checkVisibility() === true`
            + ` && document.querySelector('${ROOM_H1}')`
            + `.textContent.trim() !== ${
                JSON.stringify(roomHeading)
            }`
            + ` ? document.querySelector('${ROOM_H1}')`
            + `.textContent.trim() : null`,
            'status heading',
        );
        assert(statusHeading.length > 0);
        await page.evaluate('history.back(); true');
        assertStrictEquals(
            await page.until<string>(
                `document.querySelector('${ROOM_H1}')`
                + `?.textContent?.trim() === ${
                    JSON.stringify(roomHeading)
                }`
                + ` ? document.querySelector(`
                + `'${ROOM_H1}').textContent.trim()`
                + ` : null`,
                'room heading after first back',
            ),
            roomHeading,
        );
        await page.evaluate('history.back(); true');
        await page.until(
            `document.querySelector(`
            + `'#api-elevation svg')`
            + `?.checkVisibility() === true`
            + ` && document.querySelector(`
            + `'#api-room')?.hidden === true`,
            'elevation after second back',
        );
    } finally {
        await closeDocs(origin, page);
    }
});

Deno.test(
    'direct hash paints before page ready',
async () => {
    const { origin, page } = await openDocs(
        '#get/ai-agents',
    );
    try {
        assertStrictEquals(
            await page.evaluate<string>(
                'location.hash',
            ),
            '#get/ai-agents',
        );
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector('${ROOM_H1}')`
                + `?.checkVisibility() === true`,
            ),
            true,
        );
        assertStrictEquals(
            await page.evaluate<string>(
                `document.querySelector('${ROOM_H1}')`
                + `.textContent.trim()`,
            ),
            'GET /api/ai-agents/',
        );
        assertStrictEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'#api-elevation')?.hidden === true`,
            ),
            true,
        );
    } finally {
        await closeDocs(origin, page);
    }
});

Deno.test('unknown hash is an in-pane miss',
async () => {
    const { origin, page } = await openDocs(
        '#not-a-room',
    );
    try {
        const path = await page.evaluate<string>(
            'location.pathname',
        );
        assert(
            path.includes('/api-documentation/'),
            path,
        );
        assert(
            !(path.includes('/not-found/')),
            path,
        );
        const heading = await page.until<string>(
            `document.querySelector('${ROOM_H1}')`
            + `?.checkVisibility() === true`
            + ` ? document.querySelector('${ROOM_H1}')`
            + `.textContent.trim() : null`,
            'miss heading',
        );
        assert(heading.length > 0, heading);
        await page.click('[data-api-docs-back]');
        await page.until(
            `document.querySelector(`
            + `'#api-elevation svg')`
            + `?.checkVisibility() === true`
            + ` && document.querySelector(`
            + `'#api-room')?.hidden === true`,
            'elevation after miss Back',
        );
        assertStrictEquals(
            await page.evaluate<string>(
                'location.hash',
            ),
            '',
        );
    } finally {
        await closeDocs(origin, page);
    }
});
