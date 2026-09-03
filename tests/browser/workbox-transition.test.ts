import { assert } from '@std/assert';
import {
    useBrowser, withAdminPage, type Page,
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

async function createOnboardingWorkOrder(
    page: Page, baseUrl: string,
): Promise<void> {
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
}

async function bindFirstInstance(
    page: Page,
): Promise<void> {
    await page.click(
        '[data-dialog-open="bind-instance"]',
    );
    await page.waitFor(
        '#bind-instance-dialog[open]',
    );
    await page.waitFor('[data-instance-pick]');
    await page.click('[data-instance-pick]');
    await page.until(
        `document.querySelector(`
        + `'[data-binding="bound"]') !== null`,
        'bound badge',
    );
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
    'bind, fill, and submit navigates to the inbox'
    + ' (WB11)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                await bindFirstInstance(page);
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
