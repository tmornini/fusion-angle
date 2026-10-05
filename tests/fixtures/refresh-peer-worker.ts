// A peer test file, as deno test --parallel runs one: a
// worker in this process with ./test's per-worker preload
// loaded first. It holds the refresh lock and announces an
// access token on the refresh bus when told to.
import '../worker-name-prefix.ts';

const REFRESH_LOCK = 'fusion-refresh';
const REFRESH_CHANNEL = 'fusion-angle:refresh';

const worker = self as unknown as Worker;
let release: (() => void) | undefined;

worker.onmessage = (event: MessageEvent<string>) => {
    if (event.data === 'hold') {
        void navigator.locks.request(REFRESH_LOCK, () =>
            new Promise<void>((resolve) => {
                release = resolve;
                worker.postMessage('holding');
            }));
    } else if (event.data === 'announce') {
        const bus = new BroadcastChannel(REFRESH_CHANNEL);
        bus.postMessage({ accessToken: 'peer-access' });
        bus.close();
    } else if (event.data === 'release') {
        release?.();
    }
};
