import {
    assert,
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

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';
const PROJECT_ID = 'pnXmXrxOWayANgDLdCjuBw';
const OBJECTIVE_ID = 'ohqxgUBEaFQwYbXsonRPmg';
const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';
const REDRAW_DEADLINE_MS = 2000;

Deno.test(
    'the objective card drills in place',
    () => withLocalStorageAsync(
        (() => {
            const storage = new Map<string, string>();
            return {
                getItem: (key: string) =>
                    storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
                removeItem: (key: string) => {
                    storage.delete(key);
                },
            };
        })(),
        async () => {
            const g = globalThis as
                Record<string, unknown>;
            const gauges = {
                id: 'gauge-container',
                innerHTML: '',
                addEventListener: () => {},
                querySelector: () => null,
                querySelectorAll: () => [],
            };
            const cardWaiters: Array<
                (html: string) => void
            > = [];
            let cardHtml = '';
            const cardListeners: Array<{
                type: string;
                fn: EventListener;
            }> = [];
            const card = {
                id: 'objective-aggregates-card',
                get innerHTML(): string {
                    return cardHtml;
                },
                set innerHTML(value: string) {
                    cardHtml = value;
                    const waiting = cardWaiters.splice(0);
                    for (const resolve of waiting) {
                        resolve(value);
                    }
                },
                addEventListener(
                    type: string,
                    fn: EventListener,
                ): void {
                    cardListeners.push({ type, fn });
                },
                querySelector: () => null,
                querySelectorAll: () => [],
            };
            g['window'] = {
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
                querySelector: (selector: string) => {
                    if (selector === '#gauge-container') {
                        return gauges;
                    }
                    if (
                        selector
                            === '#objective-aggregates-card'
                    ) {
                        return card;
                    }
                    return null;
                },
            };
            try {
                const { initAdapter } = await import(
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
                const { getClient } = await import(
                    '../web-app/app/client.ts'
                );
                getClient().putSessionToken(token);
                const { inPageContext } = await import(
                    './in-page-facade.ts'
                );
                const seedCtx = inPageContext(db, token);
                const org = 'organizations/'
                    + ORGANIZATION_ID;
                await seedCtx.PUT(
                    org + '/projects/' + PROJECT_ID,
                    {
                        title: 'North',
                        description: 'd',
                        progress: 0,
                        start_date: '2026-05-14',
                        target_end_date: '2026-05-14',
                        estimated_cost: 0,
                        actual_cost: 0,
                        position: 0,
                        state: 'approved',
                    },
                );
                await seedCtx.PUT(
                    org + '/objectives/' + OBJECTIVE_ID,
                    { position: 0, state: 'active' },
                );
                await seedCtx.PUT(
                    org + '/objectives/' + OBJECTIVE_ID
                        + '/revisions/'
                        + generateIdentifier(),
                    {
                        objective_id: OBJECTIVE_ID,
                        name: 'Raise income',
                        description: 'd',
                        member_id: MEMBER_ID,
                        at: '2026-05-14T00:00:00.000000Z',
                    },
                );
                const { init } = await import(
                    '../web-app/dashboard/index.ts'
                );
                await init();
                assert(cardHtml.includes(
                    'data-objective-id="'
                    + OBJECTIVE_ID + '"',
                ));
                assert(cardHtml.includes('tabindex="0"'));
                assertStrictEquals(
                    cardHtml.includes('data-drill-back'),
                    false,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'click',
                    ).length,
                    1,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'keydown',
                    ).length,
                    1,
                );

                function listeners(
                    type: string,
                ): EventListener[] {
                    return cardListeners
                        .filter(item => item.type === type)
                        .map(item => item.fn);
                }
                function fire(
                    type: string,
                    event: Event,
                ): void {
                    const fn = listeners(type)[0];
                    assert(fn, type);
                    fn(event);
                }
                function pointer(
                    target: object,
                    key?: string,
                ): Event & { defaultPrevented: boolean } {
                    let prevented = false;
                    return {
                        target,
                        key,
                        preventDefault() {
                            prevented = true;
                        },
                        get defaultPrevented() {
                            return prevented;
                        },
                    } as unknown as Event & {
                        defaultPrevented: boolean;
                    };
                }
                function rowTarget(): object {
                    const row = {
                        closest(selector: string) {
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return row;
                            }
                            return null;
                        },
                        getAttribute(name: string) {
                            return name
                                === 'data-objective-id'
                                ? OBJECTIVE_ID
                                : null;
                        },
                    };
                    return row;
                }
                function dotTarget(): object {
                    const dot = {
                        closest(selector: string) {
                            if (selector === '.spark-dot') {
                                return dot;
                            }
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return rowTarget();
                            }
                            return null;
                        },
                    };
                    return dot;
                }
                function anchorTarget(): object {
                    const anchor = {
                        closest(selector: string) {
                            if (selector === 'a') {
                                return anchor;
                            }
                            if (
                                selector
                                    === '[data-objective-id]'
                            ) {
                                return rowTarget();
                            }
                            return null;
                        },
                    };
                    return anchor;
                }
                function backTarget(): object {
                    const button = {
                        closest(selector: string) {
                            if (
                                selector
                                    === '[data-drill-back]'
                            ) {
                                return button;
                            }
                            return null;
                        },
                    };
                    return button;
                }
                function nextCardHtml(): Promise<string> {
                    return new Promise((resolve, reject) => {
                        const timer = setTimeout(() => {
                            reject(new Error(
                                'objective card did'
                                + ' not redraw',
                            ));
                        }, REDRAW_DEADLINE_MS);
                        cardWaiters.push(html => {
                            clearTimeout(timer);
                            resolve(html);
                        });
                    });
                }

                const ignored = pointer(rowTarget(), 'x');
                fire('keydown', ignored);
                assertStrictEquals(
                    ignored.defaultPrevented, false,
                );
                const dot = pointer(dotTarget(), ' ');
                fire('keydown', dot);
                assertStrictEquals(
                    dot.defaultPrevented, false,
                );
                const link = pointer(anchorTarget());
                fire('click', link);
                assertStrictEquals(
                    link.defaultPrevented, false,
                );
                const chrome = pointer({
                    closest: () => null,
                });
                fire('click', chrome);
                assertStrictEquals(
                    chrome.defaultPrevented, false,
                );

                const openKey = pointer(rowTarget(), ' ');
                const opened = nextCardHtml();
                fire('keydown', openKey);
                assertStrictEquals(
                    openKey.defaultPrevented, true,
                );
                const drilled = await opened;
                assert(drilled.includes('data-drill-back'));
                assert(drilled.includes('← Objectives'));
                assert(drilled.includes('Raise income'));
                assert(drilled.includes('North'));
                assert(drilled.includes(
                    'href="../projects/detail.html'
                    + '?projectId=' + PROJECT_ID + '"',
                ));
                assert(drilled.includes('objective-drill'));
                assert(drilled.includes(
                    'data-project-id="'
                    + PROJECT_ID + '"',
                ));
                assert(drilled.includes(
                    'data-empty="true"',
                ));
                assertStrictEquals(
                    drilled.includes('icon-box'),
                    false,
                );

                const close = pointer(backTarget());
                const closed = nextCardHtml();
                fire('click', close);
                assertStrictEquals(
                    close.defaultPrevented, false,
                );
                const listed = await closed;
                assert(listed.includes('icon-box'));
                assertStrictEquals(
                    listed.includes('data-drill-back'),
                    false,
                );

                const openEnter = pointer(
                    rowTarget(), 'Enter',
                );
                const entered = nextCardHtml();
                fire('keydown', openEnter);
                assertStrictEquals(
                    openEnter.defaultPrevented, true,
                );
                assert(
                    (await entered).includes(
                        'data-drill-back',
                    ),
                );
                const closeEnter = pointer(backTarget());
                const closedEnter = nextCardHtml();
                fire('click', closeEnter);
                await closedEnter;

                const openClick = pointer(rowTarget());
                const reopened = nextCardHtml();
                fire('click', openClick);
                assertStrictEquals(
                    openClick.defaultPrevented, true,
                );
                assert(
                    (await reopened).includes(
                        'data-drill-back',
                    ),
                );

                await seedCtx.PUT(
                    org + '/projects/' + PROJECT_ID
                        + '/objective-actual-scores/'
                        + generateIdentifier(),
                    {
                        project_id: PROJECT_ID,
                        objective_id: OBJECTIVE_ID,
                        score: 40,
                        member_id: MEMBER_ID,
                        at: '2026-05-15T00:00:00.000000Z',
                    },
                );
                const { notifyProjectScoreChange } =
                    await import(
                        '../client/project-scoring.ts'
                    );
                const scored = nextCardHtml();
                notifyProjectScoreChange();
                const stillDrilled = await scored;
                assert(stillDrilled.includes(
                    'data-drill-back',
                ));
                assert(stillDrilled.includes('North'));

                const {
                    getProjectEntities,
                    putProjectFields,
                } = await import(
                    '../client/projects.ts'
                );
                const heldProject = (
                    await getProjectEntities(seedCtx)
                ).find(message =>
                    message.body().toValue().id
                        === PROJECT_ID,
                );
                assert(heldProject);
                const renamed = nextCardHtml();
                await putProjectFields(
                    seedCtx, heldProject, {
                        title: 'South',
                        description: 'd',
                        startDate: '2026-05-14',
                        targetEndDate: '2026-05-14',
                        estimatedCost: 0,
                    },
                );
                const retitled = await renamed;
                assert(retitled.includes('South'));
                assert(retitled.includes(
                    'data-drill-back',
                ));
                assertStrictEquals(
                    retitled.includes('North'),
                    false,
                );

                const {
                    getObjectives,
                    postObjectiveArchival,
                } = await import(
                    '../client/objectives.ts'
                );
                const heldObjective = (
                    await getObjectives(seedCtx)
                ).find(message =>
                    message.body().toValue().id
                        === OBJECTIVE_ID,
                );
                assert(heldObjective);
                const archived = nextCardHtml();
                await postObjectiveArchival(
                    seedCtx, heldObjective,
                );
                const aggregate = await archived;
                assert(aggregate.includes('icon-box'));
                assertStrictEquals(
                    aggregate.includes('data-drill-back'),
                    false,
                );

                await init();
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'click',
                    ).length,
                    1,
                );
                assertStrictEquals(
                    cardListeners.filter(
                        item => item.type === 'keydown',
                    ).length,
                    1,
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
        },
    ),
);
