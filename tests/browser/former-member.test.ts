import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../../api/api.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { nowUtc } from '../../shared/types.ts';
import { membershipNameOf } from
    '../../shared/membership-name.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    adminToken, useBrowser, withAdminPage, type Origin,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
// The seed's Lisa Wang: a single-seat Stark member who
// submits two ideas, transitions work orders, and scores
// projects — B28's removal target.
const LISA_WANG = 'RPzLGrWcstxLaHoBcViPLQ';
const ERROR_CARD =
    `document.querySelector('[data-retry-btn]') !== null`;

// B28 through the API on the test origin, the way the
// two-jars test writes its idea: the page under test is
// the one that reads, not the one that removes.
async function removeLisaWang(origin: Origin): Promise<void> {
    const name = membershipNameOf(
        STARK_ORGANIZATION, LISA_WANG,
    );
    const head = await origin.db.messagePairs.getHeadPair(
        '/invitations/', name,
    );
    assert(head !== null);
    const res = await handleRequest(origin.db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK_ORGANIZATION
            + '/invitations/' + name,
        token: await adminToken(),
        body: { state: 'removed', at: nowUtc() },
        headers: { 'If-Match': '"' + head.id + '"' },
    }));
    assertStrictEquals(res.status, 200);
}

function countAtLeast(selector: string, min: number): string {
    return `(() => {
        const n = document.querySelectorAll(${
            JSON.stringify(selector)
        }).length;
        return n >= ${min} ? n : null;
    })()`;
}

Deno.test(
    'ideas/ lists its cards after B28 removed a submitter (D1)',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await removeLisaWang(origin);
            await page.navigate(registryUrl(origin.baseUrl, 'ideas'));
            await page.ready('ideas');
            const cards = await page.until<number>(
                countAtLeast('[data-idea-card]', 6),
                'six idea cards',
            );
            assert(cards >= 6);
            assertStrictEquals(
                await page.evaluate<boolean>(ERROR_CARD), false,
            );
            assert(await page.evaluate<boolean>(
                `document.body.textContent.includes('Former member')`,
            ));
        });
    },
);

Deno.test(
    'the workbox Archive tab lists completed work orders'
    + ' after B28 (WB3)',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await removeLisaWang(origin);
            await page.navigate(
                registryUrl(origin.baseUrl, 'workbox'),
            );
            await page.ready('workbox');
            await page.click('[data-tab="archive"]');
            const rows = await page.until<number>(
                countAtLeast(
                    '#archive-list [data-work-order-card]', 1,
                ),
                'archived rows',
            );
            assert(rows >= 1);
            assertStrictEquals(
                await page.evaluate<boolean>(ERROR_CARD), false,
            );
        });
    },
);

Deno.test(
    'organization/ loads its header and boxes after B28 (G9)',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await removeLisaWang(origin);
            await page.navigate(
                registryUrl(origin.baseUrl, 'organization'),
            );
            await page.ready('organization');
            await page.waitFor('#org-edit-btn');
            await page.waitFor('#objectives-box');
            assertStrictEquals(
                await page.evaluate<boolean>(ERROR_CARD), false,
            );
        });
    },
);
