import { assert, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../../api/api.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { customerProfileRecordId } from
    '../../api/mock-data/records.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { apiRequest } from '../http-fixtures.ts';
import {
    adminToken, useBrowser, withAdminPage,
    type Origin, type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ONBOARDING_FLOW_ID =
    'esKujtyQFYUJaVSXWwavzA';
const SUBMIT_EDGE_ID =
    'JZJrLAteZStrqAvzZiamtA';
const COMPANY_NAME_ID =
    'CPJmMPXRaBIiNdGBofUPVg';
const CONTACT_EMAIL_ID =
    'oeqelDVElwxHYWkWRVTCYw';

// Create still posts an unbound work order (TODO.md
// bind-at-creation). Submit is value-bearing; an
// unbound required node 400s. Genesis + bind here
// until create carries the instance.
async function bindGenesisInstance(
    origin: Origin, workOrderId: string,
): Promise<void> {
    const token = await adminToken();
    const instanceId = generateIdentifier();
    const created = await handleRequest(
        origin.db, apiRequest({
            method: 'PATCH',
            path: '/organizations/'
                + STARK_ORGANIZATION
                + '/record-types/'
                + customerProfileRecordId
                + '/instances/' + instanceId,
            token,
            headers: { 'if-none-match': '*' },
            body: { set: [] },
        }),
    );
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const head = await handleRequest(
        origin.db, apiRequest({
            method: 'GET',
            path: '/organizations/'
                + STARK_ORGANIZATION
                + '/work-orders/' + workOrderId,
            token,
        }),
    );
    assertStrictEquals(head.status, 200);
    const etag = head.headers.get('ETag');
    assert(etag !== null);
    await head.body?.cancel();
    const bound = await handleRequest(
        origin.db, apiRequest({
            method: 'PUT',
            path: '/organizations/'
                + STARK_ORGANIZATION
                + '/work-orders/' + workOrderId
                + '/binding',
            token,
            body: {
                instance_id: instanceId,
                record_type_id:
                    customerProfileRecordId,
            },
            headers: { 'If-Match': etag },
        }),
    );
    assertStrictEquals(bound.status, 200);
    await bound.body?.cancel();
}

async function createOnboardingWorkOrder(
    page: Page, baseUrl: string,
): Promise<string> {
    await page.navigate(
        registryUrl(baseUrl, 'workbox'),
    );
    await page.ready('workbox');
    await page.click('#create-work-order-btn');
    const readyItem =
        `[data-flow-id="${ONBOARDING_FLOW_ID}"]`;
    await page.until(
        `document.querySelector(${
            JSON.stringify(readyItem)
        })?.checkVisibility() === true`,
        'READY Customer Onboarding',
    );
    await page.click(readyItem);
    await page.until(
        `location.pathname.endsWith(`
        + `'/workbox/detail.html')`,
        'action screen',
    );
    await page.ready('workbox-detail');
    const id = await page.evaluate<string>(
        `new URLSearchParams(location.search)`
        + `.get('id') ?? ''`,
    );
    assert(id !== '');
    return id;
}

async function fillRequired(
    page: Page,
): Promise<void> {
    const company =
        `#wo-attr-${COMPANY_NAME_ID}`;
    const email =
        `#wo-attr-${CONTACT_EMAIL_ID}`;
    await page.until(
        `document.querySelector(${
            JSON.stringify(company)
        })?.disabled === false`,
        'Company Name enabled',
    );
    await page.evaluate(
        `document.querySelector(${
            JSON.stringify(company)
        }).value = 'Acme Corp';`
        + `document.querySelector(${
            JSON.stringify(email)
        }).value = 'ops@acme.example';`,
    );
}

Deno.test(
    'workbox inbox shows two cards and pills',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await page.navigate(
                    registryUrl(
                        origin.baseUrl, 'workbox',
                    ),
                );
                await page.ready('workbox');
                assert(
                    await page.until<boolean>(
                        `document.body.innerText`
                        + `.includes(`
                        + `'Work Orders available`
                        + ` to me')`
                        + ` && document.body`
                        + `.innerText.includes(`
                        + `'Work Orders claimed`
                        + ` by me')`,
                        'two card headlines',
                    ),
                );
                assert(
                    await page.until<boolean>(
                        `document.querySelector(`
                        + `'[data-inbox-pill=`
                        + `"claimed"]')`
                        + `?.getAttribute(`
                        + `'aria-pressed')`
                        + ` === 'true'`,
                        'Active pill pressed',
                    ),
                );
                const sub = await page.evaluate<
                    string
                >(
                    `document.querySelector(`
                    + `'.page-header p')`
                    + `?.textContent ?? ''`,
                );
                assertStrictEquals(sub, '');
                const bind = await page.evaluate<
                    boolean
                >(
                    `document.getElementById(`
                    + `'workbox-tabs') === null`,
                );
                assert(bind);
            },
        );
    },
);

Deno.test(
    'fill and submit navigates to the inbox'
    + ' (WB11)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const workOrderId =
                    await createOnboardingWorkOrder(
                        page, origin.baseUrl,
                    );
                await bindGenesisInstance(
                    origin, workOrderId,
                );
                await page.navigate(
                    registryUrl(
                        origin.baseUrl,
                        'workbox-detail',
                        'id=' + workOrderId,
                    ),
                );
                await page.ready('workbox-detail');
                await fillRequired(page);
                await page.click(
                    `[data-edge-id="${SUBMIT_EDGE_ID}"]`,
                );
                await page.until(
                    `location.pathname.endsWith(`
                    + `'/workbox/index.html')`,
                    'inbox',
                );
                await page.ready('workbox');
                assert(
                    await page.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'Transition complete'))`,
                        'Transition complete toast',
                    ),
                );
            },
        );
    },
);

Deno.test(
    'the action screen has no bind or release'
    + ' chrome',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                const bind = await page.evaluate<
                    boolean
                >(
                    `document.querySelector(`
                    + `'[data-dialog-open=`
                    + `"bind-instance"]')`
                    + ` === null`
                    + ` && document.getElementById(`
                    + `'unclaim-btn') === null`,
                );
                assert(bind);
            },
        );
    },
);
