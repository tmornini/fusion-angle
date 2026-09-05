import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';

const CHANNEL_NAME = 'fusion-angle:data';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';

// A re-init that fails OUTSIDE loadInto's fetch — here
// `$required('#ideas-list')` on the second boot — must reach
// the page error state with Try Again, exactly as a first
// boot's failure does through handlePageLoadError, and must
// never leak to the global unhandledrejection handler. Stubs
// land before any web-app import — the module graph reads
// theme/session state at load.

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
    'a failed empty-page re-init renders the error state,'
    + ' not an unhandled rejection',
    () => withLocalStorageAsync(
        (() => {
            const storage = new Map<string, string>();
            return {
                getItem: (k: string) =>
                    storage.get(k) ?? null,
                setItem: (k: string, v: string) => {
                    storage.set(k, v);
                },
                removeItem: (k: string) => {
                    storage.delete(k);
                },
            };
        })(),
        async () => {
        const g = globalThis as Record<string, unknown>;
        const listStub = makeListStub();
        const createButton = makeCreateButtonStub();
        // After the first boot, the list element is gone:
        // the second init's $required throws before
        // loadInto ever runs. The error state renders into
        // .page-content, which the stub serves as the same
        // list element so the assertion can read it.
        let listGone = false;
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
                if (sel === '#ideas-list') {
                    return listGone ? null : listStub;
                }
                if (sel === '.page-content') return listStub;
                if (sel === '#create-idea-btn') {
                    return createButton;
                }
                return null;
            },
        };
        const unhandled: unknown[] = [];
        const onRejection = (
            event: PromiseRejectionEvent,
        ) => {
            event.preventDefault();
            unhandled.push(event.reason);
        };
        globalThis.addEventListener(
            'unhandledrejection', onRejection,
        );
        try {
            await import('./in-page-facade.ts');
            const { initAdapter, putSessionToken } =
                await import(
                    '../web-app/app/adapters/init.ts'
                );
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            await seedHumanMember(db, MEMBER_ID, 'Demo Test');
            assertStrictEquals(
                await initAdapter(() => db), true,
            );
            putSessionToken(await organizationToken());
            const { init } = await import(
                '../web-app/ideas/index.ts'
            );
            await init();
            assert(
                listStub.innerHTML.includes('No Ideas Yet'),
                'precondition: empty state rendered',
            );
            listGone = true;
            const poster = new BroadcastChannel(CHANNEL_NAME);
            poster.postMessage({ kind: 'full' });
            const deadline = Date.now() + 5000;
            while (
                !listStub.innerHTML.includes('Try Again')
                && Date.now() < deadline
            ) {
                await new Promise(r => setImmediate(r));
            }
            poster.close();
            assertEquals(
                unhandled, [],
                'the re-init failure must not leak to the'
                + ' global handler',
            );
            assert(
                listStub.innerHTML.includes('Try Again'),
                'the failed re-init must render the page'
                + ' error state',
            );
        } finally {
            globalThis.removeEventListener(
                'unhandledrejection', onRejection,
            );
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
