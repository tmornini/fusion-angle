import { assert, assertStrictEquals } from '@std/assert';
import { buildMembers } from '../../api/mock-data/members.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { SEED_RECORD_TYPE_ID } from
    '../../api/mock-data/seed-message-pairs.ts';
import {
    deleteWorkOrderClaim,
    getRecordInstance,
    getWorkOrders,
    isClaimedAndUnlapsed,
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
import { organizationToken } from '../token-fixtures.ts';
import {
    ADMIN_EMAIL,
    SECOND_EMAIL,
    adminToken,
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

// A seeded Customer Onboarding work order at Data Capture,
// available to the admin; its submit edge leaves the node.
const DATA_CAPTURE = 'gButmqAicxcpsNuiTYQNKA';
const SUBMIT_EDGE_ID = 'JZJrLAteZStrqAvzZiamtA';
const ONBOARDING_FLOW_ID = 'esKujtyQFYUJaVSXWwavzA';
const COMPANY_NAME_ID = 'CPJmMPXRaBIiNdGBofUPVg';
const CONTACT_EMAIL_ID = 'oeqelDVElwxHYWkWRVTCYw';
const PHONE_WIDTH = 375;
const PHONE_HEIGHT = 800;

function memberOf(email: string): { id: string; name: string } {
    const member = buildMembers().find((m) => m.email === email);
    assert(member !== undefined, email);
    return { id: member.id, name: member.name };
}

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

// Through the API: a work order whose head names a node its
// own flow graph does not hold. No gate refuses the move
// (TODO.md, "The work-order gates check no node and no
// edge"): its submit goes along an edge added to this
// test's copy of the graph, to a node that does not exist.
async function unplacedWorkOrder(
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
    const submit = created.flowGraph.edges.find(
        (e) => e.id === SUBMIT_EDGE_ID,
    );
    assert(submit !== undefined);
    const nowhere = {
        ...submit,
        id: generateIdentifier(),
        toNodeId: generateIdentifier(),
    };
    await postWorkOrderTransition(ctx, {
        workOrder: {
            ...created,
            flowGraph: {
                ...created.flowGraph,
                edges: [...created.flowGraph.edges, nowhere],
            },
        },
        edgeId: nowhere.id,
        values: {
            [COMPANY_NAME_ID]: 'Acme Corp',
            [CONTACT_EMAIL_ID]: 'ops@acme.example',
        },
        instance: instance.message,
    });
    return workOrderId;
}

function cardSelector(id: string): string {
    return `[data-work-order-card="${id}"]`;
}

function addressId(page: Page): Promise<string | null> {
    return page.evaluate<string | null>(
        `new URLSearchParams(location.search).get('id')`,
    );
}

async function openWorkbox(
    page: Page, origin: Origin,
): Promise<void> {
    await page.navigate(registryUrl(origin.baseUrl, 'workbox'));
    await page.ready('workbox');
    await page.until(
        `document.querySelectorAll(`
        + `'#available-list [data-work-order-card]')`
        + `.length > 0`,
        'available cards',
    );
}

async function untilBoxHolds(
    page: Page, id: string,
): Promise<void> {
    await page.until(
        `document.querySelector(`
        + `'#work-order-box #work-order-header .badge-neutral')`
        + `?.textContent.includes(${JSON.stringify(id)})`,
        'the box holds ' + id,
    );
}

// A long list puts most rows below the fold: scroll the row
// into view, click it, and wait for the box to hold it.
async function openRow(page: Page, id: string): Promise<void> {
    const selector = JSON.stringify(cardSelector(id));
    await page.evaluate(
        `document.querySelector(${selector})`
        + `.scrollIntoView({ block: 'center' })`,
    );
    await page.click(cardSelector(id));
    await untilBoxHolds(page, id);
}

function switchChecked(value: 'true' | 'false'): string {
    return `document.getElementById('work-order-claim-switch')`
        + `?.getAttribute('aria-checked') === '${value}'`;
}

function submitDisabled(disabled: boolean): string {
    return `document.querySelector(`
        + `'[data-edge-id="${SUBMIT_EDGE_ID}"]')`
        + `?.disabled === ${disabled}`;
}

Deno.test(
    'opening a row fills the box, marks the row, and sets'
    + ' the id',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            assert(await page.until<boolean>(
                `document.querySelector(${
                    JSON.stringify(cardSelector(DATA_CAPTURE))
                })?.getAttribute('aria-current') === 'true'`,
                'the open row marked',
            ));
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(`
                    + `'[data-work-order-card][aria-current]')`
                    + `.length`,
                ),
                1,
            );
            assertStrictEquals(
                await addressId(page), DATA_CAPTURE,
            );
            assert(await page.evaluate<boolean>(
                `location.pathname`
                + `.endsWith('/workbox/index.html')`,
            ));
            assert(await page.evaluate<boolean>(
                switchChecked('false'),
            ));
            // Opening inspects: it never claims.
            const opened = await workOrderOf(ctx, DATA_CAPTURE);
            assert(!isClaimedAndUnlapsed(opened.claim));
        });
    },
);

Deno.test(
    'the close control empties the box and clears the id',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            await page.click('#work-order-close');
            assert(await page.until<boolean>(
                `document.getElementById('work-order-box')`
                + `.textContent.includes(`
                + `'Select a work order to open it here')`,
                'the empty box',
            ));
            assertStrictEquals(await addressId(page), null);
            assert(await page.evaluate<boolean>(
                `new URLSearchParams(location.search)`
                + `.has('organization')`,
            ));
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(`
                    + `'[data-work-order-card][aria-current]')`
                    + `.length`,
                ),
                0,
            );
        });
    },
);

Deno.test(
    'loading the page with an id opens that work order',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + DATA_CAPTURE,
            ));
            await page.ready('workbox');
            await untilBoxHolds(page, DATA_CAPTURE);
            assert(await page.until<boolean>(
                `document.querySelector(${
                    JSON.stringify(cardSelector(DATA_CAPTURE))
                })?.getAttribute('aria-current') === 'true'`,
                'the open row marked',
            ));
        });
    },
);

Deno.test('the switch claims and releases', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const ctx = await adminContext(origin);
        const admin = memberOf(ADMIN_EMAIL);
        await openWorkbox(page, origin);
        await openRow(page, DATA_CAPTURE);
        assert(await page.evaluate<boolean>(
            submitDisabled(true),
        ));
        await page.click('#work-order-claim-switch');
        await page.waitFor(
            '#claimed-list ' + cardSelector(DATA_CAPTURE),
        );
        assert(await page.until<boolean>(
            switchChecked('true')
            + ` && document.getElementById('work-order-claim')`
            + `.textContent.includes(${
                JSON.stringify('Claimed by ' + admin.name)
            })`,
            'the switch on, named for the admin',
        ));
        assert(await page.until<boolean>(
            submitDisabled(false), 'the transition enabled',
        ));
        const claimed = await workOrderOf(ctx, DATA_CAPTURE);
        assert(
            isClaimedAndUnlapsed(claimed.claim)
            && claimed.claim.memberId === admin.id,
        );
        await page.click('#work-order-claim-switch');
        await page.waitFor(
            '#available-list ' + cardSelector(DATA_CAPTURE),
        );
        assert(await page.until<boolean>(
            switchChecked('false') + ' && '
            + submitDisabled(true),
            'the switch off, the transition disabled',
        ));
        const released = await workOrderOf(ctx, DATA_CAPTURE);
        assert(!isClaimedAndUnlapsed(released.claim));
    });
});

Deno.test(
    'a claim another member took leaves the switch off',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const sarah = memberOf(SECOND_EMAIL);
            const sarahCtx = inPageContext(
                origin.db,
                await organizationToken(
                    sarah.id, STARK_ORGANIZATION,
                ),
            );
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            // The box latched the head from before Sarah's
            // claim, so its PUT names a stale tag: 412.
            await putWorkOrderClaim(
                sarahCtx,
                await workOrderOf(sarahCtx, DATA_CAPTURE),
            );
            await page.click('#work-order-claim-switch');
            assert(await page.until<boolean>(
                `[...document.querySelectorAll('.toast')]`
                + `.some(t => t.textContent.includes(`
                + `'Failed to claim work order'))`,
                'the refusal toast',
            ));
            assert(await page.until<boolean>(
                `document.getElementById('work-order-claim')`
                + `?.textContent.includes(${
                    JSON.stringify('Claimed by ' + sarah.name)
                }) === true`
                + ` && document.getElementById(`
                + `'work-order-claim-switch') === null`,
                'the holder named, no switch',
            ));
            await page.until(
                `document.querySelector(${
                    JSON.stringify(cardSelector(DATA_CAPTURE))
                }) === null`,
                'the row gone from the admin\'s lists',
            );
        });
    },
);

Deno.test(
    'on a phone opening scrolls to the box and closing'
    + ' scrolls back',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.setViewport(
                PHONE_WIDTH, PHONE_HEIGHT, true,
            );
            await openWorkbox(page, origin);
            const top = (id: string) => `document`
                + `.getElementById('${id}')`
                + `.getBoundingClientRect().top`;
            assert(
                await page.evaluate<boolean>(
                    `${top('work-order-box')} >= innerHeight`,
                ),
                'the box starts below the fold',
            );
            await openRow(page, DATA_CAPTURE);
            assert(await page.until<boolean>(
                `(() => { const t = ${top('work-order-box')};`
                + ` return t >= 0 && t < innerHeight; })()`,
                'the box in view',
            ));
            await page.click('#work-order-close');
            assert(await page.until<boolean>(
                `(() => { const t = ${top('work-order-lists')};`
                + ` return t >= 0 && t < innerHeight; })()`,
                'the lists in view',
            ));
        });
    },
);

Deno.test(
    'the Records page\'s work order link opens it in the'
    + ' workbox',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.navigate(registryUrl(
                origin.baseUrl, 'records',
                'id=' + SEED_RECORD_TYPE_ID,
            ));
            await page.ready('records');
            await page.waitFor('.record-wo-link');
            const id = await page.evaluate<string>(
                `document.querySelector('.record-wo-link')`
                + `.getAttribute('data-work-order-id')`,
            );
            await page.evaluate(
                `document.querySelector('.record-wo-link')`
                + `.scrollIntoView({ block: 'center' })`,
            );
            await page.click('.record-wo-link');
            await page.until(
                `location.pathname`
                + `.endsWith('/workbox/index.html')`,
                'the workbox',
            );
            await page.ready('workbox');
            await untilBoxHolds(page, id);
            assertStrictEquals(await addressId(page), id);
        });
    },
);

// Far past any flow's lock timeout (8 hours by default).
const LAPSE_MS = 30 * 24 * 60 * 60 * 1000;

Deno.test(
    'the switch releases a claim that lapsed on this clock',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const ctx = await adminContext(origin);
            await putWorkOrderClaim(
                ctx, await workOrderOf(ctx, DATA_CAPTURE),
            );
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + DATA_CAPTURE,
            ));
            await page.ready('workbox');
            await untilBoxHolds(page, DATA_CAPTURE);
            await page.waitFor(
                '#claimed-list ' + cardSelector(DATA_CAPTURE),
            );
            assert(await page.until<boolean>(
                switchChecked('true'), 'the switch on',
            ));
            // Painted while the claim was live; the page's
            // clock now runs past its expiry, the server's
            // does not.
            await page.evaluate(`(() => {
                const now = Date.now;
                Date.now = () => now.call(Date) + ${LAPSE_MS};
            })()`);
            await page.click('#work-order-claim-switch');
            await page.waitFor(
                '#available-list ' + cardSelector(DATA_CAPTURE),
            );
            const released = await workOrderOf(ctx, DATA_CAPTURE);
            assert(!isClaimedAndUnlapsed(released.claim));
        });
    },
);

Deno.test(
    'a work order the box cannot draw shows the failed'
    + ' state',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await unplacedWorkOrder(
                await adminContext(origin),
            );
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + id,
            ));
            await page.ready('workbox');
            assert(await page.until<boolean>(
                `document.querySelector(`
                + `'#work-order-box [data-retry-btn]') !== null`
                + ` && document.getElementById(`
                + `'work-order-close') !== null`,
                'the failed state, with Try Again and close',
            ));
            assertStrictEquals(await addressId(page), id);
        });
    },
);

// Another tab's write, as this tab hears it.
async function ringBells(page: Page): Promise<void> {
    await page.evaluate(`(() => {
        const bus = new BroadcastChannel('fusion-angle:data');
        bus.postMessage({ kind: 'full' });
        bus.close();
    })()`);
}

const FOCUSED_ID = `document.activeElement?.id ?? ''`;

Deno.test('closing the box hands focus to the box', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openWorkbox(page, origin);
        await openRow(page, DATA_CAPTURE);
        await page.click('#work-order-close');
        assert(await page.until<boolean>(
            `${FOCUSED_ID} === 'work-order-box'`,
            'the box focused',
        ));
    });
});

Deno.test(
    'a refused claim hands focus back to the switch',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const sarah = memberOf(SECOND_EMAIL);
            const sarahCtx = inPageContext(
                origin.db,
                await organizationToken(
                    sarah.id, STARK_ORGANIZATION,
                ),
            );
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            // Sarah claims and releases after the box read:
            // the head it latches is stale, so its PUT
            // answers 412, and the re-read offers the
            // switch again.
            const held = await putWorkOrderClaim(
                sarahCtx,
                await workOrderOf(sarahCtx, DATA_CAPTURE),
            );
            await deleteWorkOrderClaim(sarahCtx, held);
            await page.evaluate(
                `document.getElementById(`
                + `'work-order-claim-switch')`
                + `.dataset.painted = 'before'`,
            );
            await page.click('#work-order-claim-switch');
            assert(await page.until<boolean>(
                `[...document.querySelectorAll('.toast')]`
                + `.some(t => t.textContent.includes(`
                + `'Failed to claim work order'))`,
                'the refusal toast',
            ));
            assert(await page.until<boolean>(
                `(() => {
                    const s = document.getElementById(
                        'work-order-claim-switch');
                    return s !== null
                        && s.dataset.painted === undefined
                        && document.activeElement === s;
                })()`,
                'the re-read switch focused',
            ));
        });
    },
);

Deno.test('a lists repaint keeps focus on its row', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openWorkbox(page, origin);
        const link = JSON.stringify(
            cardSelector(DATA_CAPTURE) + ' a[href]',
        );
        await page.evaluate(
            `document.querySelector(${link}).focus();`
            + `document.querySelectorAll(`
            + `'[data-work-order-card]')`
            + `.forEach(c => c.dataset.painted = 'before')`,
        );
        await ringBells(page);
        assert(await page.until<boolean>(
            `document.querySelector(`
            + `'[data-work-order-card][data-painted]') === null`
            + ` && document.querySelector(${link}) !== null`
            + ` && document.activeElement`
            + ` === document.querySelector(${link})`,
            'the repainted row focused',
        ));
    });
});

Deno.test(
    'a bell that shows a failed box again takes no focus',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await unplacedWorkOrder(
                await adminContext(origin),
            );
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + id,
            ));
            await page.ready('workbox');
            const retry = `document.querySelector(`
                + `'#work-order-box [data-retry-btn]')`;
            await page.until(`${retry} !== null`, 'Try Again');
            await page.evaluate(
                `document.getElementById('workbox-search')`
                + `.focus();`
                + `${retry}.dataset.painted = 'before'`,
            );
            await ringBells(page);
            assert(await page.until<boolean>(
                `${retry} !== null`
                + ` && ${retry}.dataset.painted === undefined`,
                'the box shown again',
            ));
            assertStrictEquals(
                await page.evaluate<string>(FOCUSED_ID),
                'workbox-search',
            );
        });
    },
);

Deno.test('a lists repaint keeps the page where it is', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openWorkbox(page, origin);
        // The last row sits below the fold; its link holds
        // focus without the page moving to it.
        const last = await page.evaluate<string>(
            `[...document.querySelectorAll(`
            + `'#work-order-lists [data-work-order-card]')]`
            + `.at(-1).getAttribute('data-work-order-card')`,
        );
        const link = JSON.stringify(
            cardSelector(last) + ' a[href]',
        );
        await page.evaluate(
            `document.querySelector(${link})`
            + `.focus({ preventScroll: true });`
            + `document.querySelectorAll(`
            + `'[data-work-order-card]')`
            + `.forEach(c => c.dataset.painted = 'before')`,
        );
        const top = `document.querySelector(${link})`
            + `.getBoundingClientRect().top`;
        const before = await page.evaluate<number>(top);
        assert(
            before >= await page.evaluate<number>('innerHeight'),
            'the focused row starts below the fold',
        );
        await ringBells(page);
        assert(await page.until<boolean>(
            `document.querySelector(`
            + `'[data-work-order-card][data-painted]') === null`
            + ` && document.activeElement`
            + ` === document.querySelector(${link})`,
            'the repainted row focused',
        ));
        assertStrictEquals(await page.evaluate<number>(top), before);
    });
});

Deno.test('a pills repaint keeps the page where it is', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openWorkbox(page, origin);
        // Scrolled to the bottom, the pills sit above the
        // window; one holds focus without the page moving.
        const pill = `document.querySelector(`
            + `'[data-workbox-pill="claimed"]')`;
        await page.evaluate(
            `scrollTo(0, document.documentElement.scrollHeight);`
            + `${pill}.focus({ preventScroll: true });`
            + `${pill}.dataset.painted = 'before'`,
        );
        const before = await page.evaluate<number>('scrollY');
        assert(
            await page.evaluate<number>(
                `${pill}.getBoundingClientRect().bottom`,
            ) < 0,
            'the focused pill starts above the window',
        );
        await ringBells(page);
        assert(await page.until<boolean>(
            `${pill}.dataset.painted === undefined`
            + ` && document.activeElement === ${pill}`,
            'the repainted pill focused',
        ));
        assertStrictEquals(
            await page.evaluate<number>('scrollY'), before,
        );
    });
});

// Sarah claims and releases after the box read: the head
// the box latches is stale, so its claim answers 412.
async function staleTheBoxHead(origin: Origin): Promise<void> {
    const sarah = memberOf(SECOND_EMAIL);
    const sarahCtx = inPageContext(
        origin.db,
        await organizationToken(sarah.id, STARK_ORGANIZATION),
    );
    const held = await putWorkOrderClaim(
        sarahCtx, await workOrderOf(sarahCtx, DATA_CAPTURE),
    );
    await deleteWorkOrderClaim(sarahCtx, held);
}

// The box's re-reads of DATA_CAPTURE start with its
// versions GET; nothing else on the page asks for one.
function holdBoxReads(
    page: Page, fn: (hold: RequestHold) => Promise<void>,
): Promise<void> {
    return withHeldRequests(
        page,
        `*/work-orders/${DATA_CAPTURE}/versions/*`,
        (request) => request.method === 'GET',
        fn,
    );
}

Deno.test(
    'a refused claim whose re-read fails keeps focus on the'
    + ' switch',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            await staleTheBoxHead(origin);
            await holdBoxReads(page, async (hold) => {
                await page.click('#work-order-claim-switch');
                await hold.fail(await hold.next());
                assert(await page.until<boolean>(
                    `[...document.querySelectorAll('.toast')]`
                    + `.some(t => t.textContent.includes(`
                    + `'refresh failed'))`,
                    'the failed re-read toast',
                ));
            });
            assertStrictEquals(
                await page.evaluate<string>(FOCUSED_ID),
                'work-order-claim-switch',
            );
        });
    },
);

Deno.test(
    'a refused claim\'s re-read leaves focus where the'
    + ' person put it',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            await staleTheBoxHead(origin);
            await page.evaluate(
                `document.getElementById(`
                + `'work-order-claim-switch')`
                + `.dataset.painted = 'before'`,
            );
            await holdBoxReads(page, async (hold) => {
                await page.click('#work-order-claim-switch');
                const reread = await hold.next();
                // Opening the row scrolled the search box
                // off the top: a click there lands on
                // nothing.
                await page.evaluate(
                    `document.getElementById('workbox-search')`
                    + `.scrollIntoView({ block: 'center' })`,
                );
                await page.click('#workbox-search');
                await hold.release(reread);
            });
            assert(await page.until<boolean>(
                `(() => {
                    const s = document.getElementById(
                        'work-order-claim-switch');
                    return s !== null
                        && s.dataset.painted === undefined;
                })()`,
                'the re-read switch painted',
            ));
            assertStrictEquals(
                await page.evaluate<string>(FOCUSED_ID),
                'workbox-search',
            );
        });
    },
);

Deno.test(
    'a claim\'s answer leaves focus where the person put it',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await openWorkbox(page, origin);
            await openRow(page, DATA_CAPTURE);
            await withHeldRequests(
                page,
                `*/work-orders/${DATA_CAPTURE}/claim`,
                (request) => request.method === 'PUT',
                async (hold) => {
                    await page.click('#work-order-claim-switch');
                    const claim = await hold.next();
                    // Opening the row scrolled the search box
                    // off the top: a click there lands on
                    // nothing.
                    await page.evaluate(
                        `document.getElementById(`
                        + `'workbox-search')`
                        + `.scrollIntoView({ block: 'center' })`,
                    );
                    await page.click('#workbox-search');
                    await hold.release(claim);
                },
            );
            assert(await page.until<boolean>(
                switchChecked('true'), 'the switch on',
            ));
            assertStrictEquals(
                await page.evaluate<string>(FOCUSED_ID),
                'workbox-search',
            );
        });
    },
);

Deno.test(
    'a bell that shows a failed box again keeps focus on'
    + ' Try Again',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const id = await unplacedWorkOrder(
                await adminContext(origin),
            );
            await page.navigate(registryUrl(
                origin.baseUrl, 'workbox', 'id=' + id,
            ));
            await page.ready('workbox');
            const retry = `document.querySelector(`
                + `'#work-order-box [data-retry-btn]')`;
            // The person's own open focuses Try Again.
            await page.until(
                `${retry} !== null`
                + ` && document.activeElement === ${retry}`,
                'Try Again focused',
            );
            await page.evaluate(
                `${retry}.dataset.painted = 'before'`,
            );
            await ringBells(page);
            assert(await page.until<boolean>(
                `${retry} !== null`
                + ` && ${retry}.dataset.painted === undefined`,
                'the box shown again',
            ));
            assert(await page.evaluate<boolean>(
                `document.activeElement === ${retry}`,
            ));
        });
    },
);
