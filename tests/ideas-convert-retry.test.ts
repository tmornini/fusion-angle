import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import './hmac-test-key.ts';
import type { ClientFacadeAdapter } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { createHttpFacade } from '../client/http-facade.ts';
import { postIdeaCreation } from '../client/ideas.ts';
import {
    generateIdentifier,
    NEVER_WRITTEN_IDENTIFIER,
} from '../shared/identifier.ts';
import {
    createAppClient,
    getClient,
    putClient,
    sessionContext,
} from '../web-app/app/client.ts';
import { init } from '../web-app/ideas/convert.ts';
import { initAdapter } from './client-init.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    IN_PROCESS_ORIGIN,
    inProcessFetch,
} from './in-page-facade.ts';
import { deleteNotificationChannel } from
    '../client/broadcast-channel.ts';

const MEMBER_ID = 'XXZruirZyAOoRpNxaDnpSA';

// Try Again used to call init() with no arguments. init
// without an idea id navigates to the ideas list, so the
// button left the page it was offering to retry. Both
// load failures must retry the same params.

interface ConvertPage {
    locations: string[];
    htmlHistory: string[];
    clicks: Array<() => Promise<void>>;
}

function installConvertPage(): ConvertPage {
    const locations: string[] = [];
    const htmlHistory: string[] = [];
    const clicks: Array<() => Promise<void>> = [];
    const root = {
        set innerHTML(value: string) {
            htmlHistory.push(value);
        },
        get innerHTML(): string {
            return htmlHistory.at(-1) ?? '';
        },
        querySelector(selector: string) {
            if (selector !== '[data-retry-btn]') {
                return null;
            }
            return {
                addEventListener(
                    type: string,
                    fn: () => Promise<void>,
                ) {
                    if (type === 'click') clicks.push(fn);
                },
            };
        },
    };
    const g = globalThis as Record<string, unknown>;
    g['window'] = {
        addEventListener: () => {},
        location: {
            set href(url: string) {
                locations.push(url);
            },
            get href(): string {
                return locations.at(-1) ?? '';
            },
        },
    };
    g['document'] = {
        addEventListener: () => {},
        querySelector: (selector: string) =>
            selector === '#convert-content'
                ? root : null,
    };
    return { locations, htmlHistory, clicks };
}

function restorePageGlobals(): void {
    const g = globalThis as Record<string, unknown>;
    delete g['window'];
    delete g['document'];
    deleteNotificationChannel();
}

async function boot(): Promise<{
    db: MemoryDbAdapter;
    token: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    assertStrictEquals(
        await initAdapter(() => db), true,
    );
    await seedHumanMember(db, MEMBER_ID, 'Demo Test');
    const token = await organizationToken();
    getClient().putSessionToken(token);
    return { db, token };
}

function objectivesDown(
    adapter: ClientFacadeAdapter,
): typeof fetch {
    const inner = inProcessFetch(adapter);
    return (input, requestInit) => {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.href
                : input.url;
        if (url.includes('/objectives')) {
            return Promise.reject(
                new Error('objectives down'),
            );
        }
        return inner(input, requestInit);
    };
}

async function retryStays(
    page: ConvertPage,
    ideaId: string,
    failure: string,
): Promise<void> {
    await init({ ideaId });
    const painted = page.htmlHistory.at(-1) ?? '';
    assert(
        painted.includes(failure),
        'error state missing: ' + painted.slice(0, 180),
    );
    assert(
        painted.includes('Try Again'),
        'Try Again missing',
    );
    assertEquals(page.clicks.length, 1);
    const before = page.htmlHistory.length;
    await page.clicks[0]!();
    assertEquals(
        page.locations, [],
        'Try Again must stay on the convert page',
    );
    assert(
        page.htmlHistory.length > before,
        'Try Again must load the idea again',
    );
    const again = page.htmlHistory.at(-1) ?? '';
    assert(again.includes(failure));
    assert(again.includes('Try Again'));
}

Deno.test(
    'a failed idea load retries that idea',
    async () => {
        const page = installConvertPage();
        try {
            await boot();
            await retryStays(
                page,
                NEVER_WRITTEN_IDENTIFIER,
                'Failed to load idea',
            );
        } finally {
            restorePageGlobals();
        }
    },
);

Deno.test(
    'a failed objectives load retries that idea',
    async () => {
        const page = installConvertPage();
        try {
            const { db, token } = await boot();
            const ideaId = generateIdentifier();
            await postIdeaCreation(
                sessionContext(),
                ideaId,
                {
                    title: 'Retry me',
                    position: 1,
                    problem_statement: 'p',
                    target_users: 't',
                    proposed_solution: 's',
                    expected_outcome: 'o',
                    success_metrics: 'm',
                },
                'active',
            );
            putClient(createAppClient(createHttpFacade(
                IN_PROCESS_ORIGIN,
                objectivesDown(db),
            )));
            getClient().putSessionToken(token);
            await retryStays(
                page,
                ideaId,
                'Failed to load organization',
            );
        } finally {
            restorePageGlobals();
        }
    },
);
