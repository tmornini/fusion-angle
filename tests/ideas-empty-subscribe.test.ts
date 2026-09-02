import { assert, assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const CHANNEL_NAME = 'fusion-angle:data';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const SUBMITTED_AT = '2026-08-25T00:00:00.000000Z';

// SV8b: a list page whose initial fetch is EMPTY must
// still hear the cross-tab fusion-angle:data bell and
// come alive. Stubs land before any web-app import —
// the module graph reads theme/session state at load.

function makeListStub(): {
    innerHTML: string;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
    insertAdjacentElement: () => void;
} {
    return {
        innerHTML: '',
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
        g['window'] = {
            matchMedia: () => ({
                matches: false,
                addEventListener: () => {},
                removeEventListener: () => {},
            }),
            addEventListener: () => {},
        };
        g['MutationObserver'] = class {
            observe(): void {}
        };
        g['document'] = {
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
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
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
            putSessionToken(
                await organizationToken(),
            );
            const { init } = await import(
                '../web-app/ideas/index.ts'
            );
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
            const {
                createRequestContext,
                organizationItem,
            } = await import(
                '../web-app/app/adapters/shared.ts'
            );
            const ctx = createRequestContext(
                db, await organizationToken(),
            );
            const ideaId = generateIdentifier();
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
            // The two PUTs alone must not wake the page:
            // drain as generously as the post-bell assert
            // does, then prove the list is still empty.
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            assert(
                !listStub.innerHTML.includes(
                    'Cross-tab idea',
                ),
                'the raw PUTs alone must not wake'
                + ' the empty page',
            );
            const poster = new BroadcastChannel(
                CHANNEL_NAME,
            );
            poster.postMessage({ kind: 'full' });
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
            // The divorce point opened ONE channel per
            // process when init subscribed; a test process
            // has no unload to reclaim it, so release it
            // here — after the assertion above.
            const { deleteNotificationChannel } =
                await import(
                    '../web-app/app/adapters/broadcast-channel.ts'
                );
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    }),
);
