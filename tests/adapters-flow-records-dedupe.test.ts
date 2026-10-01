import { assertEquals } from '@std/assert';
import type { RequestContext } from
    '../client/request-context.ts';
import { getFlowEntities } from
    '../client/flows.ts';
import {
    loadRecordFlowJoins,
} from '../client/flow-records.ts';
import { responseMessage } from './fixtures/response-message.ts';

Deno.test(
    'record-detail load GETs flows/ once and each'
        + ' records/ once',
    async () => {
        const paths: string[] = [];
        const organization = 'AjdvjuECVZEgZoFajaIEkg';
        const flowA = 'flow-a';
        const flowB = 'flow-b';
        const hold = Promise.withResolvers<void>();
        let pendingRecords = 0;
        let joinDuringRecords = false;
        const ctx = {
            identity: { organization },
            GET: async (path: string) => {
                paths.push(path);
                if (path.endsWith('/flows/')) {
                    return responseMessage([
                        { id: flowA, name: 'A' },
                        { id: flowB, name: 'B' },
                    ]);
                }
                if (
                    /\/flows\/[^/]+\/records\/$/
                        .test(path)
                ) {
                    pendingRecords++;
                    await hold.promise;
                    pendingRecords--;
                    return responseMessage([]);
                }
                if (path.endsWith('/work-orders/')) {
                    if (pendingRecords > 0) {
                        joinDuringRecords = true;
                    }
                    hold.resolve();
                    return responseMessage([]);
                }
                return responseMessage([]);
            },
        } as unknown as RequestContext;
        const timer = setTimeout(
            () => hold.resolve(),
            100,
        );
        try {
            const flows = await getFlowEntities(ctx);
            await loadRecordFlowJoins(
                ctx, 'record-1', flows,
            );
        } finally {
            clearTimeout(timer);
        }
        assertEquals(
            paths.filter(p => p.endsWith('/flows/'))
                .length,
            1,
        );
        const records = paths.filter(p =>
            /\/flows\/[^/]+\/records\/$/.test(p),
        );
        const prefix = 'organizations/'
            + organization + '/flows/';
        assertEquals(
            records.toSorted(),
            [
                prefix + flowA + '/records/',
                prefix + flowB + '/records/',
            ].toSorted(),
        );
        assertEquals(joinDuringRecords, true);
    },
);
