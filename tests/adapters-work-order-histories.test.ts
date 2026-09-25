import {
    assert,
    assertEquals,
} from '@std/assert';
import {
    getWorkOrderHistories,
} from '../client/work-orders-queries.ts';
import type { RequestContext } from
    '../client/request-context.ts';

Deno.test(
    'getWorkOrderHistories does not GET work-orders/',
    async () => {
        const paths: string[] = [];
        const ctx = {
            identity: {
                organization: 'AjdvjuECVZEgZoFajaIEkg',
            },
            GET: async (path: string) => {
                paths.push(path);
                return [];
            },
        } as unknown as RequestContext;
        await getWorkOrderHistories(
            ctx, [{ id: 'w1' }],
        );
        assertEquals(
            paths.some(p =>
                p.endsWith('/work-orders/')
                && !p.includes('/history'),
            ),
            false,
        );
        assert(
            paths.some(p => p.endsWith('/history')),
        );
    },
);
