import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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
    return Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
            setTimeout(() => {
                reject(new Error('still pending'));
            }, SETTLE_DEADLINE_MS).unref();
        }),
    ]);
}

test('send carries the session id and resolves by id',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send(
        'Runtime.evaluate', { expression: '1' }, 'S1',
    );
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assert.equal(sent.method, 'Runtime.evaluate');
    assert.equal(sent.sessionId, 'S1');
    assert.deepEqual(sent.params, { expression: '1' });
    ws.receive({
        id: sent.id, sessionId: 'S1', result: { v: 1 },
    });
    assert.deepEqual(await reply, { v: 1 });
});

test('a send without a session omits the field',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Page.enable');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    assert.equal('sessionId' in sent, false);
    assert.equal('params' in sent, false);
    ws.receive({ id: sent.id, result: {} });
    assert.deepEqual(await reply, {});
});

test('an error reply rejects with the CDP message',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const reply = cdp.send('Nope.nope');
    const sent = JSON.parse(ws.sent[0]!) as Sent;
    ws.receive({
        id: sent.id,
        error: { message: 'no such method', code: -1 },
    });
    await assert.rejects(reply, /CDP no such method/);
});

test('events reach listeners by method with a session',
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
    assert.deepEqual(seen, [[{ requestId: 'r1' }, 'S1']]);
});

test('closing rejects every send still awaiting a reply',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    const first = cdp.send('Page.enable');
    const second = cdp.send('Runtime.enable', {}, 'S1');
    cdp.close();
    await assert.rejects(
        withinDeadline(first), /CDP socket closed/,
    );
    await assert.rejects(
        withinDeadline(second), /CDP socket closed/,
    );
});

test('a send after close rejects instead of orphaning',
async () => {
    const ws = new FakeSocket();
    const cdp = CdpClient.fromSocket(ws);
    cdp.close();
    await assert.rejects(
        withinDeadline(cdp.send('Page.enable')),
        /CDP socket closed/,
    );
    assert.deepEqual(ws.sent, []);
});
