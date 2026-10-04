import {
    assert,
    assertEquals,
    assertStrictEquals,
} from '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// Private bus: the suite shares one process, and another
// file's post on fusion-angle:data would wake this page.
const CHANNEL_NAME = 'fusion-angle:ideas-empty';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const SUBMITTED_AT = '2026-08-25T00:00:00.000000Z';

// SV8b: a list page whose initial fetch is EMPTY must
// still hear the cross-tab fusion-angle:data bell and
// come alive. Stubs land before any web-app import —
// the module graph reads theme/session state at load.

function makeListStub(): {
    innerHTML: string;
    readonly renders: number;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
    insertAdjacentElement: () => void;
} {
    // Every init writes the list first, before its fetch, so
    // a wake shows here the moment it is delivered.
    let markup = '';
    let renders = 0;
    return {
        get innerHTML(): string {
            return markup;
        },
        set innerHTML(value: string) {
            markup = value;
            renders += 1;
        },
        get renders(): number {
            return renders;
        },
        id: 'ideas-list',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        // The re-init's data path reaches drag-reorder,
        // which parks an aria-live announcer after the
        // list and watches the list for card churn.
        insertAdjacentElement: () => {},
    };
}

function makeCreateButtonStub(): {
    classList: {
        add: (c: string) => void;
        remove: (c: string) => void;
        contains: (c: string) => boolean;
    };
    addEventListener: () => void;
} {
    const classes = new Set<string>();
    return {
        classList: {
            add: (c: string) => { classes.add(c); },
            remove: (c: string) => { classes.delete(c); },
            contains: (c: string) => classes.has(c),
        },
        addEventListener: () => {},
    };
}

Deno.test(
    'an empty initial ideas load still subscribes'
    + ' to cross-tab changes',
    () => withLocalStorageAsync(
        (() => {
            const storage = new Map<
                string, string
            >();
            return {
                getItem: (k: string) =>
                    storage.get(k) ?? null,
                setItem: (
                    k: string, v: string,
                ) => {
                    storage.set(k, v);
                },
                removeItem: (k: string) => {
                    storage.delete(k);
                },
            };
        })(),
        async () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const listStub = makeListStub();
        const createButton = makeCreateButtonStub();
        const win = {
            fusionAngleDataChannel: CHANNEL_NAME,
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        const doc = {
            addEventListener: () => {},
            createElement: () => ({
                className: '',
                setAttribute: () => {},
            }),
            querySelector: (sel: string) => {
                if (sel === '#ideas-list') return listStub;
                if (sel === '#create-idea-btn') {
                    return createButton;
                }
                return null;
            },
        };
        g['window'] = win;
        g['MutationObserver'] = class {
            observe(): void {}
        };
        g['document'] = doc;
        // A bus delivers to its listeners in the order they
        // opened. Opened before the empty list opens its
        // bus, arrival hears each message before the page
        // does, and reads what the page had rendered.
        const arrival = new BroadcastChannel(CHANNEL_NAME);
        const rendersAtArrival: number[] = [];
        arrival.onmessage = () => {
            rendersAtArrival.push(listStub.renders);
        };
        let witness: BroadcastChannel | undefined;
        try {
            const { initAdapter } =
                await import(
                    './client-init.ts'
                );
            const {
                getClient, putClient,
            } = await import(
                '../web-app/app/client.ts'
            );
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            await seedHumanMember(
                db, MEMBER_ID, 'Demo Test',
            );
            const hasSchema = await initAdapter(
                () => db,
            );
            assertStrictEquals(hasSchema, true);
            const token = await organizationToken();
            const client = getClient();
            client.putSessionToken(token);
            const reclaim = (): void => {
                g['window'] = win;
                g['document'] = doc;
                putClient(client);
                client.putSessionToken(token);
            };
            const { init } = await import(
                '../web-app/ideas/index.ts'
            );
            // Another file may have replaced the globals
            // during the awaits above. The empty list
            // reads this window's private bus.
            reclaim();
            await init();
            assert(
                listStub.innerHTML.includes(
                    'No Ideas Yet',
                ),
                'precondition: empty state'
                + ' rendered',
            );
            assert(
                createButton.classList.contains('hidden'),
                'the empty render hides the header'
                + ' create button',
            );
            // Another tab writes an idea. The raw
            // ctx.PUT pair is the wire idea creation
            // drives — document then submission,
            // which getIdeas requires — minus the
            // same-tab notify, so only the
            // BroadcastChannel below can wake this
            // page.
            const { inPageContext } = await import(
                './in-page-facade.ts'
            );
            const { organizationItem } = await import(
                '../client/request-context.ts'
            );
            const ctx = inPageContext(
                db, await organizationToken(),
            );
            const ideaId = generateIdentifier();
            const rendersBeforePuts = listStub.renders;
            await ctx.PUT(
                organizationItem(
                    ctx, 'ideas', ideaId,
                ),
                {
                    title: 'Cross-tab idea',
                    problem_statement: 'p',
                    target_users: '',
                    proposed_solution: 's',
                    expected_outcome: 'o',
                    success_metrics: '',
                    position: 1,
                    state: 'active',
                },
            );
            await ctx.PUT(
                organizationItem(
                    ctx, 'ideas', ideaId,
                ) + '/submissions/'
                    + generateIdentifier(),
                {
                    idea_id: ideaId,
                    member_id: MEMBER_ID,
                    at: SUBMITTED_AT,
                },
            );
            // Opened after the page's bus: once it hears the
            // bell, the page has handled every message up to
            // and including it.
            witness = new BroadcastChannel(CHANNEL_NAME);
            const bellHandled = new Promise<void>((resolve) => {
                witness!.onmessage = () => resolve();
            });
            const poster = new BroadcastChannel(
                CHANNEL_NAME,
            );
            reclaim();
            poster.postMessage({ kind: 'full' });
            await bellHandled;
            // The two PUTs alone must not wake the page:
            // the bell is the first message since them,
            // and nothing rendered before it arrived.
            assertEquals(
                rendersAtArrival, [rendersBeforePuts],
                'the raw PUTs alone must not wake'
                + ' the empty page',
            );
            // BroadcastChannel delivery and the
            // re-run init's fetch/render pipeline
            // are asynchronous and not fixed in
            // length, so a tick count is a guess;
            // wait for the condition instead,
            // bounded by a deadline.
            const deadline = Date.now() + 5000;
            while (
                !listStub.innerHTML.includes(
                    'Cross-tab idea',
                )
                && Date.now() < deadline
            ) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            poster.close();
            assert(
                listStub.innerHTML.includes(
                    'Cross-tab idea',
                ),
                'the empty page must re-init on'
                + ' the first cross-tab bell',
            );
            assert(
                !createButton.classList.contains('hidden'),
                'the populated re-init shows the header'
                + ' create button again',
            );
        } finally {
            arrival.close();
            witness?.close();
            // The divorce point opened ONE channel per
            // process when init subscribed; a test process
            // has no unload to reclaim it, so release it
            // here — after the assertion above.
            const {
                deleteNamedNotificationChannel,
                deleteNotificationChannel,
            } = await import(
                '../client/broadcast-channel.ts'
            );
            deleteNamedNotificationChannel(CHANNEL_NAME);
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    }),
);
