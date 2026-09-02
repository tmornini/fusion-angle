import {
    assertEquals, assertRejects, assertStrictEquals,
} from '@std/assert';
import {
    CdpClient,
    type CdpSocket,
} from '../web-app/app/cdp-client.ts';

class FakeSocket implements CdpSocket {
    readonly sent: string[] = [];
    private onMessage:
        ((ev: { data: unknown }) => void) | null = null;
    addEventListener(
        type: 'message',
        fn: (ev: { data: unknown }) => void,
    ): void {
        if (type === 'message') this.onMessage = fn;
    }
    send(data: string): void {
        this.sent.push(data);
    }
    close(): void {}
    receive(message: object): void {
        this.onMessage?.({
            data: JSON.stringify(message),
        });
    }
}

type Sent = {
    id: number;
    method: string;
    params?: unknown;
    sessionId?: string;
};

// The regression these last two tests guard against IS a
// promise that never settles, and a bare `assert.rejects`
// on one would hang the suite instead of failing it. Race
// a deadline so a pending promise fails, and fails loudly.
const SETTLE_DEADLINE_MS = 1_000;

function withinDeadline<T>(promise: Promise<T>): Promise<T> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<T>((_resolve, reject) => {
        deadline = setTimeout(() => {
            reject(new Error('still pending'));
        }, SETTLE_DEADLINE_MS);
    });
    // The race settles on the promise long before the
    // deadline fires, leaving a pending timer the ops
    // sanitizer reports; clear it whichever side wins.
    return Promise.race([promise, expiry])
        .finally(() => clearTimeout(deadline));
}

Deno.test('send carries the session id and resolves by id',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send(
        'Runtime.evaluate', { expression: '1' }, 'S1',
    );
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assertStrictEquals(sent.method, 'Runtime.evaluate');
    assertStrictEquals(sent.sessionId, 'S1');
    assertEquals(sent.params, { expression: '1' });
    ws.receive({
        id: sent.id, sessionId: 'S1', result: { v: 1 },
    });
    assertEquals(await reply, { v: 1 });
});

Deno.test('a send without a session omits the field',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Page.enable');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assertStrictEquals('sessionId' in sent, false);
    assertStrictEquals('params' in sent, false);
    ws.receive({ id: sent.id, result: {} });
    assertEquals(await reply, {});
});

Deno.test('an error reply rejects with the CDP message',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Nope.nope');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    ws.receive({
        id: sent.id,
        error: { message: 'no such method', code: -1 },
    });
    await assertRejects(
        () => reply, Error, 'CDP no such method',
    );
});

Deno.test('events reach listeners by method with a session',
() => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const seen: Array<[unknown, string | undefined]> =
        [];
    const off = cdp.on(
        'Network.requestWillBeSent',
        (params, sessionId) => {
            seen.push([params, sessionId]);
        },
    );
    ws.receive({
        method: 'Network.requestWillBeSent',
        params: { requestId: 'r1' },
        sessionId: 'S1',
    });
    ws.receive({
        method: 'Page.loadEventFired',
        params: { timestamp: 1 },
    });
    off();
    ws.receive({
        method: 'Network.requestWillBeSent',
        params: { requestId: 'r2' },
    });
    assertEquals(seen, [[{ requestId: 'r1' }, 'S1']]);
});

Deno.test('closing rejects every send still awaiting a reply',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const first = cdp.send('Page.enable');
    const second = cdp.send('Runtime.enable', {}, 'S1');
    cdp.close();
    await assertRejects(
        () => withinDeadline(first), Error,
        'CDP socket closed',
    );
    await assertRejects(
        () => withinDeadline(second), Error,
        'CDP socket closed',
    );
});

Deno.test('a send after close rejects instead of orphaning',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    cdp.close();
    await assertRejects(
        () => withinDeadline(cdp.send('Page.enable')),
        Error, 'CDP socket closed',
    );
    assertEquals(ws.sent, []);
});
