import { assert, assertStrictEquals } from '@std/assert';
import {
    getRecordInstance,
    getWorkOrders,
    postWorkOrderTransition,
    putWorkOrderClaim,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';
import { createWorkOrderFromFlow } from
    '../../web-app/app/work-order-creation.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { inPageContext } from '../in-page-facade.ts';
import {
    adminToken,
    stays,
    useBrowser,
    withAdminPage,
    withHeldRequests,
    type Origin,
    type Page,
    type RequestHold,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const ONBOARDING_FLOW_ID =
    'esKujtyQFYUJaVSXWwavzA';
// Data Capture → Review: Review does not list the admin.
const SUBMIT_EDGE_ID =
    'JZJrLAteZStrqAvzZiamtA';
// Review → Data Capture: Data Capture lists the admin.
const REVISION_EDGE_ID =
    'DYcnMktqUpTdZuEBnLBppw';
const COMPANY_NAME_ID =
    'CPJmMPXRaBIiNdGBofUPVg';
const CONTACT_EMAIL_ID =
    'oeqelDVElwxHYWkWRVTCYw';
const REVIEWER_NOTES_ID =
    'ElVKgkCreTEHQXJZPBJDKw';
// A seeded Customer Onboarding work order at Data Capture,
// available to the admin, its last move long past.
const DATA_CAPTURE = 'gButmqAicxcpsNuiTYQNKA';
const EMPTY_BOX = 'Select a work order to open it here';

async function adminContext(
    origin: Origin,
): Promise<RequestContext> {
    return inPageContext(origin.db, await adminToken());
}

async function workOrderOf(
    ctx: RequestContext,
    workOrderId: string,
): Promise<WorkOrder> {
    const found = (await getWorkOrders(ctx)).find(
        (wo) => wo.id === workOrderId,
    );
    assert(found !== undefined, workOrderId);
    return found;
}

// Through the API: a fresh Customer Onboarding work order,
// filled at Data Capture and submitted to Review, where the
// admin is not on the roster; the move released the
// admin's birth claim.
async function submittedToReview(
    ctx: RequestContext,
): Promise<string> {
    const workOrderId = generateIdentifier();
    await createWorkOrderFromFlow(ctx, {
        workOrderId,
        flowLinkId: generateIdentifier(),
        flowId: ONBOARDING_FLOW_ID,
    });
    const created = await workOrderOf(ctx, workOrderId);
    assert(
        created.instanceId !== undefined
        && created.recordTypeId !== undefined,
    );
    const instance = await getRecordInstance(
        ctx, created.recordTypeId, created.instanceId,
    );
    await postWorkOrderTransition(ctx, {
        workOrder: created,
        edgeId: SUBMIT_EDGE_ID,
        values: {
            [COMPANY_NAME_ID]: 'Acme Corp',
            [CONTACT_EMAIL_ID]: 'ops@acme.example',
        },
        instance: instance.message,
    });
    return workOrderId;
}

function addressId(page: Page): Promise<string | null> {
    return page.evaluate<string | null>(
        `new URLSearchParams(location.search).get('id')`,
    );
}

function boxHolds(id: string): string {
    return `document.querySelector(`
        + `'#work-order-box #work-order-header .badge-neutral')`
        + `?.textContent.includes(${JSON.stringify(id)})`
        + ` === true`;
}

const BOX_EMPTY = `document.getElementById('work-order-box')`
    + `.textContent.includes(${JSON.stringify(EMPTY_BOX)})`;

// The lists' read: the organization's own collection, not a
// flow's work-orders/ under it.
const ORGANIZATION_WORK_ORDERS =
    /\/organizations\/[^/]+\/work-orders\/$/;

const TOAST_COUNT = `document.querySelectorAll('.toast').length`;

// Toasts sit top-centre, over the workbox's search box: a
// person closes them before clicking it.
async function closeToasts(page: Page): Promise<void> {
    let open = await page.evaluate<number>(TOAST_COUNT);
    while (open > 0) {
        await page.click('.toast-close');
        await page.until(
            `${TOAST_COUNT} < ${open}`, 'a toast closed',
        );
        open = await page.evaluate<number>(TOAST_COUNT);
    }
}

async function untilToast(
    page: Page, text: string,
): Promise<void> {
    await page.until(
        `[...document.querySelectorAll('.toast')]`
        + `.some(t => t.textContent.includes(`
        + `${JSON.stringify(text)}))`,
        text + ' toast',
    );
}

// Creates through the page: the new work order opens in
// the box, its id in the address, without a navigation.
async function createOnboardingWorkOrder(
    page: Page, baseUrl: string,
): Promise<string> {
    await page.navigate(registryUrl(baseUrl, 'workbox'));
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
    const id = await page.until<string>(
        `new URLSearchParams(location.search).get('id')`,
        'the new work order in the address',
    );
    await page.until(boxHolds(id), 'the new work order in the box');
    assert(await page.evaluate<boolean>(
        `location.pathname.endsWith('/workbox/index.html')`,
    ));
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

// A transition button sits below the box's fold: scroll it
// into view, as a person would, then click it.
async function clickEdge(
    page: Page, edgeId: string,
): Promise<void> {
    const selector = `[data-edge-id="${edgeId}"]`;
    await page.evaluate(
        `document.querySelector(${JSON.stringify(selector)})`
        + `.scrollIntoView({ block: 'center' })`,
    );
    await page.click(selector);
}

// Fills Data Capture and submits it to Review, which does
// not list the admin.
async function submitToReview(page: Page): Promise<void> {
    await fillRequired(page);
    await clickEdge(page, SUBMIT_EDGE_ID);
    await untilToast(page, 'Transition complete');
}

Deno.test(
    'the workbox shows the pills and the claimed list'
    + ' above the available list',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.navigate(
                registryUrl(origin.baseUrl, 'workbox'),
            );
            await page.ready('workbox');
            assert(await page.until<boolean>(
                `(() => {
                    const claimed = document
                        .getElementById('claimed-list');
                    const available = document
                        .getElementById('available-list');
                    return claimed !== null
                        && available !== null
                        && (claimed.compareDocumentPosition(
                            available)
                            & Node.DOCUMENT_POSITION_FOLLOWING)
                            !== 0;
                })()`,
                'claimed above available',
            ));
            assert(await page.until<boolean>(
                `document.querySelector('#workbox-pills')`
                + `?.getAttribute('aria-label')`
                + ` === 'Filter work orders'`
                + ` && document.querySelector(`
                + `'[data-workbox-pill="claimed"]') !== null`
                + ` && document.querySelector(`
                + `'[data-workbox-pill="archivedByMe"]')`
                + ` !== null`,
                'the pills',
            ));
            assert(await page.evaluate<boolean>(BOX_EMPTY));
            const sub = await page.evaluate<string>(
                `document.querySelector('.page-header p')`
                + `?.textContent ?? ''`,
            );
            assertStrictEquals(sub, '');
            assert(await page.evaluate<boolean>(
                `document.querySelector('[data-inbox-pill]')`
                + ` === null`
                + ` && document.getElementById(`
                + `'workbox-tabs') === null`,
            ));
        });
    },
);

Deno.test(
    'fill and submit moves the box to my next work (WB11)',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            // The live create binds and birth-claims, and
            // the admin holds no other claim.
            const id = await createOnboardingWorkOrder(
                page, origin.baseUrl,
            );
            await submitToReview(page);
            // The move released the claim: once the lists
            // have refreshed the row is available again.
            await page.waitFor(
                `#available-list [data-work-order-card="${id}"]`,
            );
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(`
                    + `'#claimed-list [data-work-order-card]')`
                    + `.length`,
                ),
                0,
            );
            const next = await page.evaluate<string | undefined>(
                `[...document.querySelectorAll(`
                + `'#available-list [data-work-order-card]')]`
                + `.map(c => c.getAttribute(`
                + `'data-work-order-card'))`
                + `.find(each => each !== ${JSON.stringify(id)})`,
            );
            assert(next !== undefined && next !== id);
            await page.until(boxHolds(next), 'the next work order');
            assertStrictEquals(await addressId(page), next);
            assert(await page.evaluate<boolean>(
                `location.pathname`
                + `.endsWith('/workbox/index.html')`,
            ));
            assert(await page.evaluate<boolean>(
                `![...document.querySelectorAll('.toast')]`
                + `.some(t => t.textContent.includes(`
                + `'refresh failed'))`,
            ));
        });
    },
);

Deno.test(
    'a transition to a step that lists me keeps the box on'
    + ' the work order',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            const id = await submittedToReview(ctx);
            await putWorkOrderClaim(ctx, await workOrderOf(ctx, id));
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + id,
            ));
            await page.ready('workbox');
            await page.until(boxHolds(id), 'the box holds ' + id);
            const notes = `#wo-attr-${REVIEWER_NOTES_ID}`;
            await page.until(
                `document.querySelector(${
                    JSON.stringify(notes)
                })?.disabled === false`,
                'Reviewer Notes enabled',
            );
            await page.evaluate(
                `document.querySelector(${
                    JSON.stringify(notes)
                }).value = 'Needs a purchase order';`,
            );
            await clickEdge(page, REVISION_EDGE_ID);
            await untilToast(page, 'Transition complete');
            assert(await page.until<boolean>(
                `document.querySelector(`
                + `'#work-order-header .badge-info')`
                + `?.textContent.trim() === 'Data Capture'`,
                'the box at Data Capture',
            ));
            // The move released the claim: the claim place
            // offers Claim again.
            assert(await page.until<boolean>(
                `document.getElementById(`
                + `'work-order-claim-btn')`
                + `?.dataset.claim === 'claim'`
                + ` && document.getElementById(`
                + `'work-order-claim').textContent.trim()`
                + ` === 'Claim'`,
                'the button offers Claim',
            ));
            assert(await page.evaluate<boolean>(boxHolds(id)));
            assertStrictEquals(await addressId(page), id);
        });
    },
);

Deno.test(
    'a transition to a step that is not mine opens my'
    + ' topmost claimed work order',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            // An older claim than the one about to be made.
            await putWorkOrderClaim(
                ctx, await workOrderOf(ctx, DATA_CAPTURE),
            );
            const id = await createOnboardingWorkOrder(
                page, origin.baseUrl,
            );
            await submitToReview(page);
            await page.until(
                boxHolds(DATA_CAPTURE), 'the claimed work order',
            );
            assertStrictEquals(
                await addressId(page), DATA_CAPTURE,
            );
            await page.waitFor(
                `#available-list [data-work-order-card="${id}"]`,
            );
        });
    },
);

Deno.test(
    'with only the claimed list drawn and none left the box'
    + ' closes',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await createOnboardingWorkOrder(page, origin.baseUrl);
            await page.click('[data-workbox-pill="claimed"]');
            await page.until(
                `document.querySelector(`
                + `'[data-workbox-pill="claimed"]')`
                + `?.getAttribute('aria-pressed') === 'true'`,
                'Claimed by Me pressed',
            );
            await submitToReview(page);
            assert(await page.until<boolean>(
                BOX_EMPTY, 'the box closed',
            ));
            assertStrictEquals(await addressId(page), null);
            // Rows were available, but Claimed by Me draws
            // no available list to fall back to.
            assert(await page.evaluate<boolean>(
                `document.getElementById('available-list')`
                + ` === null`,
            ));
        });
    },
);

Deno.test(
    'the box never reopens the work order it sent on',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await createOnboardingWorkOrder(
                page, origin.baseUrl,
            );
            // Searching for its id draws this work order
            // alone, so after the move it is the only row.
            await page.evaluate(`(() => {
                const box = document.getElementById(
                    'workbox-search');
                box.value = ${JSON.stringify(id)};
                box.dispatchEvent(
                    new Event('input', { bubbles: true }));
            })()`);
            await page.until(
                `document.querySelectorAll(`
                + `'#work-order-lists [data-work-order-card]')`
                + `.length === 1 && document.querySelector(`
                + `'#claimed-list [data-work-order-card=`
                + `"${id}"]') !== null`,
                'the search draws this work order alone',
            );
            await submitToReview(page);
            await page.waitFor(
                `#available-list [data-work-order-card="${id}"]`,
            );
            assert(await page.until<boolean>(
                BOX_EMPTY, 'the box closed',
            ));
            assertStrictEquals(await addressId(page), null);
        });
    },
);

Deno.test(
    'the box has no bind, release, or back chrome',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await createOnboardingWorkOrder(
                page, origin.baseUrl,
            );
            assert(await page.evaluate<boolean>(
                `document.querySelector(`
                + `'[data-dialog-open="bind-instance"]')`
                + ` === null`
                + ` && document.getElementById(`
                + `'unclaim-btn') === null`
                + ` && document.getElementById(`
                + `'work-order-back-btn') === null`,
            ));
        });
    },
);
// A margin for an answer to land and paint.
const SETTLE_MS = 600;

// The page's transition POSTs, held at the browser's
// network layer while fn runs; every other request passes.
function holdTransitions(
    page: Page, fn: (hold: RequestHold) => Promise<void>,
): Promise<void> {
    return withHeldRequests(
        page,
        '*/work-orders/*/transition',
        (request) => request.method === 'POST',
        fn,
    );
}

// A long list puts most rows below the fold: scroll the row
// into view, click it, and wait for the box to hold it.
async function openRow(page: Page, id: string): Promise<void> {
    const selector = `[data-work-order-card="${id}"]`;
    await page.evaluate(
        `document.querySelector(${JSON.stringify(selector)})`
        + `.scrollIntoView({ block: 'center' })`,
    );
    await page.click(selector);
    await page.until(boxHolds(id), 'the box holds ' + id);
}

// The box, the address, and the marked row all name id.
function openOn(id: string): string {
    return `(${boxHolds(id)})`
        + ` && new URLSearchParams(location.search)`
        + `.get('id') === ${JSON.stringify(id)}`
        + ` && [...document.querySelectorAll(`
        + `'[data-work-order-card][aria-current]')]`
        + `.map(c => c.getAttribute('data-work-order-card'))`
        + `.join() === ${JSON.stringify(id)}`;
}

const CLOSED = `${BOX_EMPTY}`
    + ` && new URLSearchParams(location.search)`
    + `.get('id') === null`
    + ` && document.querySelector(`
    + `'[data-work-order-card][aria-current]') === null`;

// Reviewer Notes, which leaving Review requires.
async function fillReviewerNotes(page: Page): Promise<void> {
    const notes = `#wo-attr-${REVIEWER_NOTES_ID}`;
    await page.until(
        `document.querySelector(${
            JSON.stringify(notes)
        })?.disabled === false`,
        'Reviewer Notes enabled',
    );
    await page.evaluate(
        `document.querySelector(${
            JSON.stringify(notes)
        }).value = 'Needs a purchase order';`,
    );
}

// The admin's Review work order, claimed and open in the box.
async function openClaimedReview(
    page: Page, origin: Origin,
): Promise<string> {
    const ctx = await adminContext(origin);
    const id = await submittedToReview(ctx);
    await putWorkOrderClaim(ctx, await workOrderOf(ctx, id));
    await page.navigate(registryUrl(
        origin.baseUrl, 'workbox', 'id=' + id,
    ));
    await page.ready('workbox');
    await page.until(boxHolds(id), 'the box holds ' + id);
    return id;
}

Deno.test(
    'a row opened while a transition is in flight keeps'
    + ' the box',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            // Claimed first: a send-on would open it.
            await putWorkOrderClaim(
                ctx, await workOrderOf(ctx, DATA_CAPTURE),
            );
            const id = await createOnboardingWorkOrder(
                page, origin.baseUrl,
            );
            await page.waitFor(
                '#available-list [data-work-order-card]',
            );
            const other = await page.evaluate<string | undefined>(
                `document.querySelector(`
                + `'#available-list [data-work-order-card]')`
                + `?.getAttribute('data-work-order-card')`,
            );
            assert(other !== undefined && other !== id);
            await fillRequired(page);
            await holdTransitions(page, async (hold) => {
                await clickEdge(page, SUBMIT_EDGE_ID);
                const submit = await hold.next();
                await openRow(page, other);
                await hold.release(submit);
                await untilToast(page, 'Transition complete');
            });
            // The bell's refresh has painted once the sent-on
            // work order is available again.
            await page.waitFor(
                `#available-list [data-work-order-card="${id}"]`,
            );
            assert(await page.evaluate<boolean>(openOn(other)));
            await stays(page, openOn(other), SETTLE_MS);
        });
    },
);

Deno.test(
    'closing the box while a transition is in flight keeps'
    + ' it closed',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openClaimedReview(page, origin);
            await fillReviewerNotes(page);
            await holdTransitions(page, async (hold) => {
                // Back to Data Capture, which lists me: the
                // answer would re-read and repaint the box.
                await clickEdge(page, REVISION_EDGE_ID);
                const revise = await hold.next();
                await page.evaluate(
                    `document.getElementById('work-order-close')`
                    + `.scrollIntoView({ block: 'center' })`,
                );
                await page.click('#work-order-close');
                await page.until(BOX_EMPTY, 'the box closed');
                await hold.release(revise);
                await untilToast(page, 'Transition complete');
            });
            assert(await page.evaluate<boolean>(CLOSED));
            await stays(page, CLOSED, SETTLE_MS);
        });
    },
);

Deno.test(
    'after a transition to my step the old form is inert'
    + ' until the box reads again',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await openClaimedReview(page, origin);
            await fillReviewerNotes(page);
            // The box's re-read starts with the versions GET;
            // nothing else on the page asks for one.
            await withHeldRequests(
                page,
                `*/work-orders/${id}/versions/*`,
                (request) => request.method === 'GET',
                async (hold) => {
                    await clickEdge(page, REVISION_EDGE_ID);
                    await untilToast(page, 'Transition complete');
                    const reread = await hold.next();
                    // No live control of the old step.
                    assert(await page.evaluate<boolean>(
                        `[...document.querySelectorAll(`
                        + `'#work-order-box [data-edge-id],`
                        + ` #work-order-box [data-attribute-id],`
                        + ` #work-order-claim-btn')]`
                        + `.every((c) => c.disabled)`,
                    ));
                    await hold.release(reread);
                },
            );
            assert(await page.until<boolean>(
                `document.querySelector(`
                + `'#work-order-header .badge-info')`
                + `?.textContent.trim() === 'Data Capture'`
                + ` && document.getElementById(`
                + `'work-order-claim-btn')?.disabled === false`,
                'the box at Data Capture, its claim live',
            ));
        });
    },
);

Deno.test(
    'a failed re-read after a transition to my step offers'
    + ' Try Again',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await openClaimedReview(page, origin);
            await fillReviewerNotes(page);
            await withHeldRequests(
                page,
                `*/work-orders/${id}/versions/*`,
                (request) => request.method === 'GET',
                async (hold) => {
                    await clickEdge(page, REVISION_EDGE_ID);
                    await untilToast(page, 'Transition complete');
                    await hold.fail(await hold.next());
                    await page.waitFor(
                        '#work-order-box [data-retry-btn]',
                    );
                    hold.stopHolding();
                },
            );
            await page.evaluate(
                `document.querySelector(`
                + `'#work-order-box [data-retry-btn]')`
                + `.scrollIntoView({ block: 'center' })`,
            );
            await page.click('#work-order-box [data-retry-btn]');
            assert(await page.until<boolean>(
                `document.querySelector(`
                + `'#work-order-header .badge-info')`
                + `?.textContent.trim() === 'Data Capture'`
                + ` && document.getElementById(`
                + `'work-order-claim-btn')?.disabled === false`,
                'Try Again recovers the box at Data Capture',
            ));
            assert(await page.evaluate<boolean>(boxHolds(id)));
        });
    },
);

Deno.test(
    'a box the page closes leaves focus where the person'
    + ' put it',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await createOnboardingWorkOrder(page, origin.baseUrl);
            await page.click('[data-workbox-pill="claimed"]');
            await page.until(
                `document.querySelector(`
                + `'[data-workbox-pill="claimed"]')`
                + `?.getAttribute('aria-pressed') === 'true'`,
                'Claimed by Me pressed',
            );
            await fillRequired(page);
            // The lists read the send-on waits for, held so
            // the person can move on before the box closes.
            // Only the organization's own collection: the
            // transition reads each flow's work-orders/
            // before it posts, and those must pass.
            await withHeldRequests(
                page,
                '*/work-orders/*',
                (request) => request.method === 'GET'
                    && ORGANIZATION_WORK_ORDERS.test(
                        new URL(request.url).pathname,
                    ),
                async (hold) => {
                    await clickEdge(page, SUBMIT_EDGE_ID);
                    await untilToast(page, 'Transition complete');
                    const lists = await hold.next();
                    await closeToasts(page);
                    await page.click('#workbox-search');
                    hold.stopHolding();
                    await hold.release(lists);
                    await hold.releaseHeld();
                },
            );
            assert(await page.until<boolean>(
                BOX_EMPTY, 'the box closed',
            ));
            assertStrictEquals(
                await page.evaluate<string>(
                    `document.activeElement?.id ?? ''`,
                ),
                'workbox-search',
            );
        });
    },
);

Deno.test(
    'a transition\'s answer leaves focus where the person'
    + ' put it',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openClaimedReview(page, origin);
            await fillReviewerNotes(page);
            await holdTransitions(page, async (hold) => {
                // Back to Data Capture, which lists me: the
                // answer shows the work order afresh.
                await clickEdge(page, REVISION_EDGE_ID);
                const revise = await hold.next();
                await page.evaluate(
                    `document.getElementById('workbox-search')`
                    + `.scrollIntoView({ block: 'center' })`,
                );
                await page.click('#workbox-search');
                await hold.release(revise);
                await untilToast(page, 'Transition complete');
            });
            assert(await page.until<boolean>(
                `document.querySelector(`
                + `'#work-order-header .badge-info')`
                + `?.textContent.trim() === 'Data Capture'`,
                'the box at Data Capture',
            ));
            assertStrictEquals(
                await page.evaluate<string>(
                    `document.activeElement?.id ?? ''`,
                ),
                'workbox-search',
            );
        });
    },
);
