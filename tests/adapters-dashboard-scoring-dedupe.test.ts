import { assertEquals, assertStrictEquals } from
    '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const PROJECT_ID = 'pnXmXrxOWayANgDLdCjuBw';
const OBJECTIVE_ID = 'ohqxgUBEaFQwYbXsonRPmg';
const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';

function makeEl(id: string): {
    id: string;
    innerHTML: string;
    addEventListener: () => void;
    querySelector: () => null;
    querySelectorAll: () => never[];
} {
    return {
        id,
        innerHTML: '',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
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

function isScorePath(path: string): boolean {
    return path.includes('/objective-baseline-scores/')
        || path.includes('/objective-actual-scores/');
}

Deno.test(
    'dashboard init GETs projects/ and objectives/ once',
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
        const gauges = makeEl('gauge-container');
        const aggregates = makeEl(
            'objective-aggregates-card',
        );
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
                if (sel === '#gauge-container') {
                    return gauges;
                }
                if (
                    sel
                        === '#objective-aggregates-card'
                ) {
                    return aggregates;
                }
                return null;
            },
        };
        try {
            const { initAdapter } =
                await import(
                    './client-init.ts'
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
            const { inPageContext, wrapInPageAdapter } =
                await import(
                    './in-page-facade.ts'
                );
            const { putProject } = await import(
                '../client/projects.ts'
            );
            const seedCtx = inPageContext(
                db, token,
            );
            await putProject(seedCtx, PROJECT_ID, {
                title: 't1',
                description: 'd',
                progress: 0,
                start_date: '2026-05-14',
                target_end_date: '2026-05-14',
                estimated_cost: 0,
                actual_cost: 0,
                position: 0,
                state: 'approved',
            }, undefined);
            await seedCtx.PUT(
                'organizations/'
                    + ORGANIZATION_ID
                    + '/objectives/'
                    + OBJECTIVE_ID,
                {
                    position: 0,
                    state: 'active',
                },
            );
            await seedCtx.PUT(
                'organizations/'
                    + ORGANIZATION_ID
                    + '/objectives/'
                    + OBJECTIVE_ID
                    + '/revisions/'
                    + generateIdentifier(),
                {
                    objective_id: OBJECTIVE_ID,
                    name: 'O',
                    description: 'd',
                    member_id: MEMBER_ID,
                    at: '2026-05-14T00:00:00.000000Z',
                },
            );
            const {
                createAppClient,
                getClient,
                putClient,
            } = await import(
                '../web-app/app/client.ts'
            );
            const inner = wrapInPageAdapter(db)({
                ...getClient(),
                navigateToAuth: () => {},
            });
            const paths: string[] = [];
            const holdObjectives =
                Promise.withResolvers<void>();
            const holdScores =
                Promise.withResolvers<void>();
            let objectivesHeld = false;
            let pendingScores = 0;
            let scoresDuringObjectives = false;
            let revisionsDuringScores = false;
            const client = createAppClient(() => ({
                ...inner,
                GETCollection: async (
                    resource,
                    token,
                    requestId,
                ) => {
                    paths.push(resource);
                    if (resource.endsWith(
                        '/objectives/',
                    )) {
                        objectivesHeld = true;
                        await holdObjectives
                            .promise;
                        objectivesHeld = false;
                    }
                    if (isScorePath(resource)) {
                        pendingScores++;
                        if (objectivesHeld) {
                            scoresDuringObjectives =
                                true;
                        }
                        holdObjectives.resolve();
                        await holdScores.promise;
                        pendingScores--;
                    }
                    if (resource.includes(
                        '/revisions/',
                    )) {
                        if (pendingScores > 0) {
                            revisionsDuringScores =
                                true;
                        }
                        holdScores.resolve();
                    }
                    return inner.GETCollection(
                        resource, token, requestId,
                    );
                },
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
            }));
            client.putSessionToken(token);
            putClient(client);
            const { init } = await import(
                '../web-app/dashboard/index.ts'
            );
            const timer = setTimeout(() => {
                holdObjectives.resolve();
                holdScores.resolve();
            }, 100);
            try {
                await init();
            } finally {
                clearTimeout(timer);
            }
            assertEquals(
                collectionGets(paths, 'projects'),
                1,
            );
            assertEquals(
                collectionGets(paths, 'objectives'),
                1,
            );
            assertEquals(
                scoresDuringObjectives, true,
            );
            assertEquals(
                revisionsDuringScores, true,
            );
        } finally {
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
