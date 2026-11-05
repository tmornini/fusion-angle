import { assert } from '@std/assert';
import { buildMembers } from
    '../../api/mock-data/members.ts';
import {
    postServiceMemberCreation,
    queryMembershipEntities,
} from '../../client/index.ts';
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
import { pollUntil } from '../../web-app/app/cdp-client.ts';

const browser = useBrowser();

// One edit short of Emily Rodriguez's surname: the box
// forgives a typo the old substring filter could not.
const TYPO = 'Rodrigez';
// A service member the seed does not carry, written after
// the page painted its roster.
const NEWCOMER = 'Quillfeather';
// One cross-tab event rings the human, AI, and service
// bells, and each re-reads the roster.
const BELLS = 3;
const HELD_TIMEOUT_MS = 5_000;

function seededId(name: string): string {
    const member = buildMembers().find((m) => m.name === name);
    assert(member !== undefined, name);
    return member.id;
}

const ROW_IDS = `JSON.stringify([...document.querySelectorAll(`
    + `'#member-list [data-member-id]')]`
    + `.map(row => row.getAttribute('data-member-id')))`;

async function rowIds(page: Page): Promise<string[]> {
    return JSON.parse(await page.evaluate<string>(ROW_IDS));
}

async function openMembers(
    page: Page, origin: Origin,
): Promise<string[]> {
    await page.navigate(registryUrl(origin.baseUrl, 'members'));
    await page.ready('members');
    await page.until(
        `document.querySelectorAll(`
        + `'#member-list [data-member-id]').length > 1`,
        'member rows',
    );
    return await rowIds(page);
}

async function typeInBox(
    page: Page, text: string,
): Promise<void> {
    await page.evaluate(`(() => {
        const box = document.getElementById('member-search');
        box.value = ${JSON.stringify(text)};
        box.dispatchEvent(
            new Event('input', { bubbles: true }));
    })()`);
}

async function answerIds(
    origin: Origin, text: string,
): Promise<Set<string>> {
    const ctx = inPageContext(origin.db, await adminToken());
    const answer = await queryMembershipEntities(
        ctx, text, 'accepted',
    );
    return new Set(
        answer.map((part) => part.body().toValue().identity_id),
    );
}

async function untilRows(
    page: Page,
    expected: readonly string[],
    label: string,
): Promise<void> {
    await page.until(
        `(() => {
            const expected = ${JSON.stringify([...expected])};
            const ids = ${ROW_IDS};
            return ids === JSON.stringify(expected);
        })()`,
        label,
    );
}

Deno.test(
    'the box narrows the roster',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const emily = seededId('Emily Rodriguez');
                const sarah = seededId('Sarah Chen');
                const roster = await openMembers(page, origin);
                assert(roster.includes(emily));
                assert(roster.includes(sarah));
                const matched = await answerIds(origin, TYPO);
                assert(matched.has(emily), 'the typo matches');
                assert(!matched.has(sarah));
                await typeInBox(page, TYPO);
                await page.until(
                    `(() => {
                        const ids = JSON.parse(${ROW_IDS});
                        return ids.includes(${
                            JSON.stringify(emily)
                        }) && !ids.includes(${
                            JSON.stringify(sarah)
                        });
                    })()`,
                    'the roster narrowed to the answer',
                );
                const narrowed = await rowIds(page);
                assert(
                    narrowed.every((id) => matched.has(id)),
                    'every row is in the answer',
                );
                assert(narrowed.length < roster.length);
            },
        );
    },
);

Deno.test(
    'clearing restores the roster',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const roster = await openMembers(page, origin);
                await typeInBox(page, TYPO);
                await page.until(
                    `JSON.parse(${ROW_IDS}).length < ${
                        roster.length
                    }`,
                    'the roster narrowed',
                );
                await typeInBox(page, '');
                await untilRows(
                    page, roster, 'the whole roster again',
                );
            },
        );
    },
);

// The page's GETs of the accepted roster, held at the
// browser's network layer (CDP Fetch) while holding is on;
// every other request passes.
type RosterHold = {
    heldAtLeast(count: number): Promise<unknown>;
    // Later roster GETs pass; the held ones stay held.
    stopHolding(): void;
    releaseHeld(): Promise<void>;
    stop(): Promise<void>;
};

async function holdRosterReads(page: Page): Promise<RosterHold> {
    const session = page.session;
    const held: string[] = [];
    let holding = true;
    const release = (requestId: string) => session.send(
        'Fetch.continueRequest', { requestId },
    );
    const off = session.client.on(
        'Fetch.requestPaused',
        (params, sessionId) => {
            if (sessionId !== session.sessionId) return;
            const paused = params as {
                readonly requestId: string;
                readonly request: {
                    readonly method: string;
                    readonly url: string;
                };
            };
            if (
                holding
                && paused.request.method === 'GET'
                && paused.request.url.includes('state=accepted')
            ) {
                held.push(paused.requestId);
                return;
            }
            void release(paused.requestId);
        },
    );
    await session.send('Fetch.enable', {
        patterns: [{
            urlPattern: '*/memberships/*',
            requestStage: 'Request',
        }],
    });
    return {
        heldAtLeast: (count) => pollUntil(
            'held roster reads', HELD_TIMEOUT_MS,
            () => Promise.resolve(held.length >= count || null),
        ),
        stopHolding: () => {
            holding = false;
        },
        releaseHeld: async () => {
            await Promise.all(held.splice(0).map(release));
        },
        stop: async () => {
            off();
            await session.send('Fetch.disable');
        },
    };
}

// Another tab's write, as this tab hears it.
async function ringBells(page: Page): Promise<void> {
    await page.evaluate(`(() => {
        const bus = new BroadcastChannel('fusion-angle:data');
        bus.postMessage({ kind: 'full' });
        bus.close();
    })()`);
}

function hasRow(id: string): string {
    return `JSON.parse(${ROW_IDS}).includes(${
        JSON.stringify(id)
    })`;
}

Deno.test(
    'a keystroke during a bell\'s read keeps the fresh'
    + ' roster',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const roster = await openMembers(page, origin);
                const ctx = inPageContext(
                    origin.db, await adminToken(),
                );
                const newcomer = generateIdentifier();
                await postServiceMemberCreation(ctx, newcomer, {
                    name: NEWCOMER + ' relay',
                    description: 'Relays the nightly build.',
                });
                assert(
                    (await answerIds(origin, NEWCOMER))
                        .has(newcomer),
                    'the QUERY names the newcomer',
                );
                const hold = await holdRosterReads(page);
                try {
                    await ringBells(page);
                    await hold.heldAtLeast(BELLS);
                    hold.stopHolding();
                    await typeInBox(page, NEWCOMER);
                    await page.until(
                        hasRow(newcomer),
                        'the newcomer under its search',
                    );
                    await hold.releaseHeld();
                    await typeInBox(page, '');
                    await page.until(
                        `${hasRow(newcomer)} && JSON.parse(${
                            ROW_IDS
                        }).length === ${roster.length + 1}`,
                        'the fresh roster, cleared',
                    );
                } finally {
                    await hold.stop();
                }
            },
        );
    },
);

Deno.test(
    'text in the box before the roster lands narrows it',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                const emily = seededId('Emily Rodriguez');
                const sarah = seededId('Sarah Chen');
                const hold = await holdRosterReads(page);
                try {
                    await page.navigate(
                        registryUrl(origin.baseUrl, 'members'),
                    );
                    await hold.heldAtLeast(1);
                    await page.until(
                        `document.getElementById(`
                        + `'member-search') !== null`,
                        'the members box',
                    );
                    // As the browser restores a box: a value
                    // with no input event.
                    await page.evaluate(`(() => {
                        document.getElementById(
                            'member-search').value =
                            ${JSON.stringify(TYPO)};
                    })()`);
                    hold.stopHolding();
                    await hold.releaseHeld();
                    await page.until(
                        `${hasRow(emily)} && !${hasRow(sarah)}`,
                        'the roster narrowed on landing',
                    );
                } finally {
                    await hold.stop();
                }
            },
        );
    },
);
