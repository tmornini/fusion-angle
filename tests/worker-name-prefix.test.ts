import { assertStrictEquals } from '@std/assert';
import { createRefreshMutex } from
    '../client/session-refresh-mutex.ts';

// Under --parallel every test file is a worker in one
// process. A peer file's refresh must neither hold this
// file's refresh lock nor hand this file its token: each
// worker is a browser origin of its own.
Deno.test('a peer worker\'s refresh neither blocks nor feeds'
+ ' this worker\'s refresh', async () => {
    const peer = new Worker(
        new URL(
            './fixtures/refresh-peer-worker.ts',
            import.meta.url,
        ).href,
        { type: 'module' },
    );
    const mutex = createRefreshMutex();
    const witness = { channel: undefined as
        BroadcastChannel | undefined };
    try {
        const holding = new Promise<void>((resolve) => {
            peer.onmessage = () => resolve();
        });
        peer.postMessage('hold');
        await holding;
        let posts = 0;
        const refreshed = mutex.runSingleFlightRefresh(
            async () => {
                posts += 1;
                return 'own-access';
            },
        );
        // Created after the mutex's bus, so it hears a
        // shared-name broadcast only once the mutex has: the
        // peer then releases, and a mutex sharing its names
        // takes the peer's token instead of refreshing.
        witness.channel = new BroadcastChannel(
            'fusion-angle:refresh',
        );
        witness.channel.onmessage = () => {
            peer.postMessage('release');
        };
        peer.postMessage('announce');
        assertStrictEquals(await refreshed, 'own-access');
        assertStrictEquals(posts, 1);
    } finally {
        peer.postMessage('release');
        witness.channel?.close();
        mutex.deleteRefreshChannel();
        peer.terminate();
    }
});
