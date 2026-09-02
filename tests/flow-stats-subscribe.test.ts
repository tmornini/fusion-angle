import { assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
    type FlowWithGraph,
} from '../api/types.ts';

const CHANNEL_NAME = 'fusion-angle:data';
const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const FLOW_NAME = 'Stats flow';
const RENAMED = 'Stats flow, renamed in another tab';

// The stats page has no edit mode, so the only flow change it
// can ever see is another tab's: it must hear the cross-tab
// fusion-angle:data bell and re-read the server. Stubs land
// before any web-app import — the module graph reads
// theme/session state at load.

function makeHostStub(): {
    id: string;
    innerHTML: string;
    nameEl: { textContent: string };
    addEventListener: () => void;
    querySelector: (selector: string) => unknown;
} {
    const nameEl = { textContent: '' };
    // renderCard requires the card slot on every render and
    // only toggles its hidden class while nothing is pinned.
    const cardEl = {
        innerHTML: '',
        classList: { add: () => {}, remove: () => {} },
    };
    return {
        id: 'flow-stats',
        innerHTML: '',
        nameEl,
        addEventListener: () => {},
        querySelector: (selector: string) => {
            if (selector === '.flow-stats-flow-name') {
                return nameEl;
            }
            if (selector === '#flow-stats-card') {
                return cardEl;
            }
            return null;
        },
    };
}

Deno.test(
    'the flow stats page re-reads the flow on the'
    + ' cross-tab bell',
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
        const g = globalThis as Record<
            string, unknown
        >;
        const host = makeHostStub();
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
            querySelector: (sel: string) =>
                sel === '#flow-stats' ? host : null,
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
            const {
                createRequestContext,
                organizationItem,
            } = await import(
                '../web-app/app/adapters/shared.ts'
            );
            const { postFlowCreation } = await import(
                '../web-app/app/adapters/flow-mutations.ts'
            );
            const ctx = createRequestContext(
                db, await organizationToken(),
            );
            const flowId = generateIdentifier();
            await postFlowCreation(ctx, {
                flowId,
                linkId: generateIdentifier(),
                projectId: generateIdentifier(),
                name: FLOW_NAME,
            });
            const { init } = await import(
                '../web-app/flows/stats.ts'
            );
            await init({ flowId });
            assertStrictEquals(
                host.nameEl.textContent, FLOW_NAME,
                'precondition: the first load names'
                + ' the flow',
            );
            // Another tab renames the flow. The raw
            // document PUT is the wire putFlow drives —
            // the same graph back, a new name and trio —
            // minus the same-tab notify, so only the
            // BroadcastChannel below can wake this page.
            const { body: current, etag } =
                await ctx.GETWithEtag<FlowWithGraph>(
                    organizationItem(
                        ctx, 'flows', flowId,
                    ),
                );
            await ctx.PUT(
                organizationItem(ctx, 'flows', flowId),
                {
                    name: RENAMED,
                    is_locked: false,
                    is_auto_layout: false,
                    is_auto_fit: false,
                    lock_timeout: DEFAULT_LOCK_TIMEOUT,
                    state: 'updated',
                    state_at: nowUtc(),
                    state_event_id: generateIdentifier(),
                    graph: current.graph,
                    graphDelta: {
                        nodes: [],
                        edges: [],
                        deletions: [],
                        memberEvents: [],
                        attributeEvents: [],
                    },
                    revivals: [],
                },
                [['if-match', '"' + etag + '"']],
            );
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            assertStrictEquals(
                host.nameEl.textContent, FLOW_NAME,
                'the raw PUT alone must not wake'
                + ' the page',
            );
            const poster = new BroadcastChannel(
                CHANNEL_NAME,
            );
            poster.postMessage({ kind: 'full' });
            // BroadcastChannel delivery and the re-run
            // load's fetch/render pipeline are
            // asynchronous; drain generously.
            for (let i = 0; i < 25; i++) {
                await new Promise(
                    r => setImmediate(r),
                );
            }
            poster.close();
            assertStrictEquals(
                host.nameEl.textContent, RENAMED,
                'the stats page must re-read the flow'
                + ' on the cross-tab bell',
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
