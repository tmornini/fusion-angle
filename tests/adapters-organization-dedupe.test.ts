import { assertEquals, assertStrictEquals } from
    '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';

function makeEl(id: string): {
    id: string;
    innerHTML: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
    toggleAttribute: () => void;
} {
    return {
        id,
        innerHTML: '',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        toggleAttribute: () => {},
    };
}

function collectionGets(
    paths: readonly string[],
    family: string,
): number {
    return paths.filter(p =>
        p.endsWith('/' + family + '/'),
    ).length;
}

Deno.test(
    'organization init GETs members/ and objectives/ once',
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
        const container = makeEl(
            'organization-content',
        );
        const button = {
            addEventListener: () => {},
        };
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
                if (sel === '#organization-content') {
                    return container;
                }
                if (
                    sel === '[data-action='
                        + '"confirm-add-objective"]'
                    || sel === '[data-action='
                        + '"confirm-edit-objective"]'
                    || sel === '[data-action='
                        + '"confirm-archive"]'
                ) {
                    return button;
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
            putSessionToken(await organizationToken());
            const {
                getClientFacade,
                putClientFacade,
            } = await import(
                '../web-app/app/adapters/facade-holder.ts'
            );
            const inner = getClientFacade();
            const paths: string[] = [];
            putClientFacade({
                ...inner,
                GET: async (
                    resource,
                    token,
                    requestId,
                ) => {
                    paths.push(resource);
                    return inner.GET(
                        resource, token, requestId,
                    );
                },
            });
            const { init } = await import(
                '../web-app/organization/index.ts'
            );
            await init();
            assertEquals(
                collectionGets(paths, 'objectives'),
                1,
            );
            assertEquals(
                collectionGets(paths, 'members'),
                1,
            );
        } finally {
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
