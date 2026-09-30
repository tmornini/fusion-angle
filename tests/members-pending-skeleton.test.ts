import { assert, assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const MEMBER_NAME = 'Demo Test';
const SKELETON_CARD = 'skeleton-card';
const DRAIN_TURNS = 5;

// The walk (I21) holds every /api/organizations/* GET and
// reads #member-list. Here the hold is the adapter's
// latency hook, which every client verb awaits before its
// simulated network hop: the members boot runs up to its
// pending read and stops there. Stubs land before any
// web-app import — the module graph reads theme and
// session state at load.

type ElementStub = {
    innerHTML: string;
    id: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
};

function makeElementStub(selector: string): ElementStub {
    return {
        innerHTML: '',
        id: selector.slice(1),
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
    };
}

function makeStorage(): {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem: (k: string) => void;
} {
    const storage = new Map<string, string>();
    return {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => { storage.set(k, v); },
        removeItem: (k) => { storage.delete(k); },
    };
}

async function drain(): Promise<void> {
    for (let i = 0; i < DRAIN_TURNS; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
    }
}

Deno.test(
    'members paints the table skeleton while its'
    + ' GETs are held (I21)',
    () => withLocalStorageAsync(makeStorage(), async () => {
        const g = globalThis as Record<string, unknown>;
        const elements = new Map<string, ElementStub>();
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
            querySelector: (selector: string) => {
                const known = elements.get(selector);
                if (known !== undefined) return known;
                const made = makeElementStub(selector);
                elements.set(selector, made);
                return made;
            },
            querySelectorAll: () => [],
        };
        const gate = { held: Promise.resolve() };
        let release = (): void => {};
        try {
            const { initAdapter } =
                await import('./client-init.ts');
            const db = new BackedDbAdapter(
                new MemoryStorageBackend(),
                () => gate.held,
                async () => {},
                () => {},
            );
            await seedAdminSchema(db);
            await seedHumanMember(db, MEMBER_ID, MEMBER_NAME);
            assertStrictEquals(
                await initAdapter(() => db), true,
            );
            const { getClient } = await import(
                '../web-app/app/client.ts'
            );
            getClient().putSessionToken(
                await organizationToken(),
            );
            const { init } = await import(
                '../web-app/members/index.ts'
            );
            gate.held = new Promise<void>((resolve) => {
                release = resolve;
            });
            const booted = init();
            await drain();
            const list = elements.get('#member-list');
            assert(list, '#member-list was never read');
            assert(
                list.innerHTML.includes(SKELETON_CARD),
                'no skeleton while the GETs are held',
            );
            release();
            await booted;
            assert(
                list.innerHTML.includes(MEMBER_NAME),
                'the settled list names the member',
            );
            assert(
                !list.innerHTML.includes(SKELETON_CARD),
                'the settled list still shows a skeleton',
            );
        } finally {
            release();
            const { deleteNotificationChannel } =
                await import(
                    '../client/broadcast-channel.ts'
                );
            deleteNotificationChannel();
            delete g['window'];
            delete g['MutationObserver'];
            delete g['document'];
        }
    }),
);
