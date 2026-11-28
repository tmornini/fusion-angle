import { assert, assertStrictEquals } from '@std/assert';
import {
    SEED_INSTANCE_ID,
    SEED_RECORD_TYPE_ID,
} from '../../api/mock-data/seed-message-pairs.ts';
import { postRecordChange } from '../../client/index.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import { inPageContext } from '../in-page-facade.ts';
import {
    adminToken,
    useBrowser,
    withAdminPage,
    type Origin,
    type Page,
} from './fixtures.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';

const browser = useBrowser();
const SECOND_NAME = 'Zebra Intake';
const PANEL_NAME = `document.querySelector(`
    + `'#record-panel h2')?.textContent.trim()`;
const ATTRIBUTE_ROWS = `document.querySelectorAll(`
    + `'.record-attribute-edit-row').length`;

function card(id: string): string {
    return `[data-record-card="${id}"]`;
}

function addressId(page: Page): Promise<string | null> {
    return page.evaluate<string | null>(
        `new URLSearchParams(location.search).get('id')`,
    );
}

// A second record after the seeded one, so there is
// somewhere else to go.
async function secondRecord(origin: Origin): Promise<string> {
    const id = generateIdentifier();
    await postRecordChange(
        inPageContext(origin.db, await adminToken()), id, {
            kind: 'create',
            record: {
                name: SECOND_NAME,
                description: 'A second shape',
                position: 1_000_000,
            },
            attributes: [],
            initialState: 'active',
        },
    );
    return id;
}

async function openRecords(
    page: Page, origin: Origin, query = '',
): Promise<void> {
    await page.navigate(
        registryUrl(origin.baseUrl, 'records', query),
    );
    await page.ready('records');
    await page.until(
        `${PANEL_NAME} !== undefined`, 'a record in the panel',
    );
}

async function untilPanelNames(
    page: Page, name: string,
): Promise<void> {
    await page.until(
        `${PANEL_NAME} === ${JSON.stringify(name)}`,
        'the panel holds ' + name,
    );
}

Deno.test(
    'the records page opens the first record beside the list',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await secondRecord(origin);
            await openRecords(page, origin);
            await untilPanelNames(page, 'Customer Profile');
            assert(await page.evaluate<boolean>(
                `document.querySelector(${
                    JSON.stringify(card(SEED_RECORD_TYPE_ID))
                }).getAttribute('aria-current') === 'true'`,
            ));
        });
    },
);

Deno.test(
    'picking a record fills the panel and names it in the'
    + ' address',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const second = await secondRecord(origin);
            await openRecords(page, origin);
            await page.click(card(second));
            await untilPanelNames(page, SECOND_NAME);
            assertStrictEquals(await addressId(page), second);
            assertStrictEquals(
                await page.evaluate<number>(
                    `document.querySelectorAll(`
                    + `'[data-record-card][aria-current]')`
                    + `.length`,
                ),
                1,
            );
            assert(await page.evaluate<boolean>(
                `location.pathname`
                + `.endsWith('/records/index.html')`,
            ));
            await openRecords(page, origin, 'id=' + second);
            await untilPanelNames(page, SECOND_NAME);
        });
    },
);

Deno.test('an open record form keeps its record', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const second = await secondRecord(origin);
        await openRecords(page, origin);
        await page.click('#record-edit-btn');
        await page.waitFor('#record-edit-name');
        await page.click(card(second));
        await page.until(
            `[...document.querySelectorAll('.toast')]`
            + `.some(t => t.textContent.includes(`
            + `'Save or cancel your changes first'))`,
            'the notice',
        );
        assertStrictEquals(
            await page.evaluate<string>(
                `document.getElementById(`
                + `'record-edit-name').value`,
            ),
            'Customer Profile',
        );
    });
});

// The panel binds its events once: after several records,
// one press still does one thing.
Deno.test(
    'after switching records one press adds one attribute',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            const second = await secondRecord(origin);
            await openRecords(page, origin);
            await page.click(card(second));
            await untilPanelNames(page, SECOND_NAME);
            await page.click(card(SEED_RECORD_TYPE_ID));
            await untilPanelNames(page, 'Customer Profile');
            await page.click('#record-edit-btn');
            await page.waitFor('#record-pending-attribute-name');
            const before = await page.evaluate<number>(
                ATTRIBUTE_ROWS,
            );
            await page.evaluate(
                `(() => { const i = document.getElementById(`
                + `'record-pending-attribute-name');`
                + ` i.value = 'Region';`
                + ` i.dispatchEvent(new Event('input',`
                + ` { bubbles: true }));`
                + ` document.getElementById(`
                + `'record-add-attribute-btn').click(); })()`,
            );
            assertStrictEquals(
                await page.evaluate<number>(ATTRIBUTE_ROWS),
                before + 1,
            );
        });
    },
);

Deno.test(
    'the record heading stays while the panel scrolls',
    async () => {
        await withAdminPage(browser.get(), async (page, origin) => {
            await page.setViewport(1280, 500, false);
            await openRecords(page, origin);
            const headTop = `document.querySelector(`
                + `'.record-panel-head')`
                + `.getBoundingClientRect().top`;
            await page.evaluate(
                `document.getElementById('record-panel')`
                + `.scrollTop = 40`,
            );
            const held = await page.evaluate<number>(headTop);
            await page.evaluate(
                `document.getElementById('record-panel')`
                + `.scrollTop = 400`,
            );
            assert(await page.evaluate<boolean>(
                `document.getElementById('record-panel')`
                + `.scrollTop > 40`,
            ));
            assertStrictEquals(
                await page.evaluate<number>(headTop), held,
            );
        });
    },
);

for (const width of [1024, 900, 320]) {
    Deno.test(
        `the records page fits a ${width}px viewport`,
        async () => {
            await withAdminPage(
                browser.get(),
                async (page, origin) => {
                    // Desktop emulation at every width, as the
                    // workbox width test explains.
                    await page.setViewport(width, 800, false);
                    await openRecords(page, origin);
                    const overflow = `Math.max(`
                        + `document.documentElement.scrollWidth`
                        + ` - innerWidth, (() => { const p =`
                        + ` document.getElementById(`
                        + `'record-panel'); return p.scrollWidth`
                        + ` - p.clientWidth; })())`;
                    assert(
                        await page.evaluate<number>(overflow)
                            <= 0,
                        'reading overflows',
                    );
                    await page.evaluate(
                        `document.getElementById(`
                        + `'record-edit-btn').click()`,
                    );
                    await page.waitFor('#record-edit-name');
                    assert(
                        await page.evaluate<number>(overflow)
                            <= 0,
                        'editing overflows',
                    );
                },
            );
        },
    );
}

Deno.test('creating a record opens it', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(
            registryUrl(origin.baseUrl, 'record-create'),
        );
        await page.ready('record-create');
        await page.evaluate(
            `document.getElementById('record-create-name')`
            + `.value = 'Fresh Shape'`,
        );
        await page.click('#record-create-submit');
        await page.until(
            `location.pathname`
            + `.endsWith('/records/index.html')`,
            'the records page',
        );
        await page.ready('records');
        await untilPanelNames(page, 'Fresh Shape');
    });
});

function cardFocused(id: string): string {
    return `document.activeElement?.closest(`
        + `'[data-record-card]')`
        + `?.dataset.recordCard === ${JSON.stringify(id)}`;
}

Deno.test('the arrow keys walk the cards and open them',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const second = await secondRecord(origin);
        await openRecords(page, origin);
        await page.click(card(SEED_RECORD_TYPE_ID));
        await page.key('ArrowDown');
        await untilPanelNames(page, SECOND_NAME);
        assert(await page.evaluate<boolean>(cardFocused(second)));
        assertStrictEquals(await addressId(page), second);
        // The last card is where down stops.
        await page.key('ArrowDown');
        assert(await page.evaluate<boolean>(cardFocused(second)));
        await page.key('ArrowUp');
        await untilPanelNames(page, 'Customer Profile');
    });
});

Deno.test('the arrow keys leave an open form alone', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const second = await secondRecord(origin);
        await openRecords(page, origin);
        await page.click('#record-edit-btn');
        await page.waitFor('#record-edit-name');
        await page.evaluate(
            `document.querySelector('${card(SEED_RECORD_TYPE_ID)}`
            + ` a[href]').focus()`,
        );
        await page.key('ArrowDown');
        assert(await page.evaluate<boolean>(cardFocused(second)));
        assert(await page.evaluate<boolean>(
            `document.getElementById('record-edit-name')`
            + ` !== null`,
        ));
    });
});

async function untilToast(page: Page, text: string): Promise<void> {
    await page.until(
        `[...document.querySelectorAll('.toast')]`
        + `.some(t => t.textContent.includes(`
        + `${JSON.stringify(text)}))`,
        'the toast ' + text,
    );
}

function press(page: Page, selector: string): Promise<unknown> {
    return page.evaluate(
        `document.querySelector(${JSON.stringify(selector)})`
        + `.click()`,
    );
}

function type(
    page: Page, selector: string, value: string,
): Promise<unknown> {
    return page.evaluate(
        `(() => { const i = document.querySelector(`
        + `${JSON.stringify(selector)});`
        + ` i.value = ${JSON.stringify(value)};`
        + ` i.dispatchEvent(new Event('input',`
        + ` { bubbles: true })); })()`,
    );
}

Deno.test('saving in the panel renames the card', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openRecords(page, origin);
        await press(page, '#record-edit-btn');
        await page.waitFor('#record-edit-name');
        await type(page, '#record-edit-name', 'Client Profile');
        await press(page, '#record-save-btn');
        await untilToast(page, 'Record saved');
        await untilPanelNames(page, 'Client Profile');
        await page.until(
            `document.querySelector('${card(SEED_RECORD_TYPE_ID)}`
            + ` a[href]')?.textContent.trim()`
            + ` === 'Client Profile'`,
            'the card renamed',
        );
    });
});

const NEW_ROW = `.record-instance-row:not([data-instance-id="${
    SEED_INSTANCE_ID
}"])`;

Deno.test('an instance is saved and deleted in the panel',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await openRecords(page, origin);
        await press(page, '#record-new-instance-btn');
        await page.waitFor('#record-instance-save-btn');
        await type(
            page, 'input[data-action="instance-field-value"]',
            'Typed value',
        );
        await press(page, '#record-instance-save-btn');
        await untilToast(page, 'Instance saved');
        await page.waitFor(NEW_ROW);
        await press(
            page,
            NEW_ROW + ' [data-dialog-open='
            + '"confirm-delete-instance"]',
        );
        await press(
            page, '[data-action="confirm-delete-instance"]',
        );
        await untilToast(page, 'Instance deleted');
        await page.until(
            `document.querySelector(${JSON.stringify(NEW_ROW)})`
            + ` === null`,
            'the row gone',
        );
    });
});

Deno.test('a record is archived from the panel', async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        const second = await secondRecord(origin);
        await openRecords(page, origin, 'id=' + second);
        await untilPanelNames(page, SECOND_NAME);
        await press(page, '#record-archive-btn');
        await press(page, '[data-action="confirm-archive"]');
        await untilToast(page, 'Record archived');
        await page.until(
            `document.querySelector('#record-archive-btn')`
            + ` === null`
            + ` && document.querySelector(`
            + `'.record-panel-head .badge')`
            + `?.textContent.trim() === 'Archived'`,
            'the panel reads Archived',
        );
    });
});

