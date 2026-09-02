import { assertStrictEquals } from '@std/assert';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    enqueueFlowSave,
    awaitFlowSave,
} from
    '../web-app/app/adapters/flow-mutations.ts';

Deno.test(
    'awaitFlowSave waits for queued work',
    async () => {
        let release: () => void = () => {};
        const gate = new Promise<void>(
            resolve => {
                release = resolve;
            },
        );
        const flowId = generateIdentifier();
        void enqueueFlowSave(
            flowId, () => gate,
        );
        let done = false;
        const waiting = awaitFlowSave(
            flowId,
        ).then(() => {
            done = true;
        });
        await Promise.resolve();
        assertStrictEquals(done, false);
        release();
        await waiting;
        assertStrictEquals(done, true);
    },
);

Deno.test(
    'awaitFlowSave with no queue is idle',
    async () => {
        await awaitFlowSave(
            generateIdentifier(),
        );
    },
);
