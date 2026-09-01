// CDP transport, Chrome launcher, and waits, shared by
// ./measure and ./test-browser. killProcessTree takes a
// structural KillableChild, not Deno.ChildProcess, so it
// stays indifferent to which runtime spawned the child.

import { join } from '@std/path';

export const CHROME_READY_MS = 15_000;
export const POLL_MS = 200;
const SOCKET_CLOSED = 'CDP socket closed';

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export async function pollUntil<T>(
    label: string,
    timeoutMs: number,
    fn: () => Promise<T | null | undefined | false>,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const v = await fn();
        if (
            v !== null
            && v !== undefined
            && v !== false
        ) {
            return v as T;
        }
        await sleep(POLL_MS);
    }
    throw new Error(
        `${label} timed out after ${timeoutMs}ms`,
    );
}

export function chromeBinary(): string {
    const chrome = Deno.env.get('CHROME');
    if (chrome) {
        return chrome;
    }
    if (Deno.build.os === 'darwin') {
        return '/Applications/Google Chrome.app'
            + '/Contents/MacOS/Google Chrome';
    }
    throw new Error(
        'Chrome not found: set CHROME to the browser'
        + ' binary path (no default outside macOS)',
    );
}

export type KillableChild = {
    readonly pid?: number | undefined;
    kill(signal: 'SIGTERM' | 'SIGKILL'): unknown;
};

// Deno.Command never makes a spawned child a process-
// group leader, so a negative-pid kill always fails here.
// Walk descendants from one ps snapshot instead.
function descendantPids(rootPid: number): number[] {
    let output: Deno.CommandOutput;
    try {
        output = new Deno.Command('ps', {
            args: ['-A', '-o', 'pid=,ppid='],
            stdout: 'piped',
            stderr: 'null',
        }).outputSync();
    } catch (error) {
        if (
            error instanceof Deno.errors.PermissionDenied
            || error instanceof Deno.errors.NotFound
        ) {
            return [];
        }
        throw error;
    }
    if (!output.success) {
        return [];
    }
    const childrenOf = new Map<number, number[]>();
    const text = new TextDecoder().decode(output.stdout);
    for (const line of text.split('\n')) {
        const fields = line.trim().split(/\s+/);
        const pidText = fields[0];
        const ppidText = fields[1];
        if (pidText === undefined || ppidText === undefined) {
            continue;
        }
        const pid = Number(pidText);
        const ppid = Number(ppidText);
        if (!Number.isFinite(pid) || !Number.isFinite(ppid)) {
            continue;
        }
        const siblings = childrenOf.get(ppid);
        if (siblings === undefined) {
            childrenOf.set(ppid, [pid]);
        } else {
            siblings.push(pid);
        }
    }
    const pids: number[] = [];
    const stack = [rootPid];
    while (stack.length > 0) {
        const pid = stack.pop();
        if (pid === undefined) continue;
        for (const kid of childrenOf.get(pid) ?? []) {
            pids.push(kid);
            stack.push(kid);
        }
    }
    return pids;
}

export function killProcessTree(
    child: KillableChild | null,
): void {
    if (child === null || child.pid === undefined) {
        return;
    }
    const descendants = descendantPids(child.pid);
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        for (const pid of descendants) {
            try {
                Deno.kill(pid, signal);
            } catch {
                // best-effort: don't let one pid block the rest
            }
        }
        try {
            child.kill(signal);
        } catch {
            // already gone
        }
    }
}

export type CdpMessage = {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { message: string; code?: number };
    sessionId?: string;
};

export interface CdpSocket {
    addEventListener(
        type: 'message',
        fn: (ev: { data: unknown }) => void,
    ): void;
    send(data: string): void;
    close(): void;
}

export type CdpEventListener = (
    params: unknown,
    sessionId: string | undefined,
) => void;

export class CdpClient {
    private ws: CdpSocket;
    private nextId = 1;
    private pending = new Map<number, {
        resolve: (v: unknown) => void;
        reject: (e: Error) => void;
    }>();
    private listeners = new Map<string,
        Set<CdpEventListener>>();
    private closed = false;

    private constructor(ws: CdpSocket) {
        this.ws = ws;
        ws.addEventListener('message', (ev) => {
            this.onMessage(String(ev.data));
        });
    }

    static fromSocket(ws: CdpSocket): CdpClient {
        return new CdpClient(ws);
    }

    static async connect(
        url: string,
    ): Promise<CdpClient> {
        const ws = new WebSocket(url);
        await new Promise<void>((resolve, reject) => {
            const onOpen = (): void => {
                cleanup();
                resolve();
            };
            const onErr = (): void => {
                cleanup();
                reject(
                    new Error(
                        'CDP WebSocket connect failed: '
                        + url,
                    ),
                );
            };
            const cleanup = (): void => {
                ws.removeEventListener(
                    'open', onOpen,
                );
                ws.removeEventListener(
                    'error', onErr,
                );
            };
            ws.addEventListener('open', onOpen);
            ws.addEventListener('error', onErr);
        });
        return new CdpClient(ws);
    }

    private onMessage(raw: string): void {
        const msg = JSON.parse(raw) as CdpMessage;
        if (msg.id === undefined) {
            if (msg.method === undefined) return;
            const set = this.listeners.get(msg.method);
            if (set === undefined) return;
            for (const fn of set) {
                fn(msg.params, msg.sessionId);
            }
            return;
        }
        const p = this.pending.get(msg.id);
        if (p === undefined) {
            return;
        }
        this.pending.delete(msg.id);
        if (msg.error !== undefined) {
            p.reject(
                new Error(
                    `CDP ${msg.error.message}`,
                ),
            );
            return;
        }
        p.resolve(msg.result);
    }

    send(
        method: string,
        params?: Record<string, unknown>,
        sessionId?: string,
    ): Promise<unknown> {
        if (this.closed) {
            return Promise.reject(
                new Error(SOCKET_CLOSED),
            );
        }
        const id = this.nextId++;
        const payload: Record<string, unknown> = {
            id,
            method,
        };
        if (params !== undefined) {
            payload.params = params;
        }
        if (sessionId !== undefined) {
            payload.sessionId = sessionId;
        }
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve,
                reject,
            });
            this.ws.send(JSON.stringify(payload));
        });
    }

    on(
        method: string,
        fn: CdpEventListener,
    ): () => void {
        let set = this.listeners.get(method);
        if (set === undefined) {
            set = new Set();
            this.listeners.set(method, set);
        }
        set.add(fn);
        return () => {
            set.delete(fn);
        };
    }

    close(): void {
        this.closed = true;
        try {
            this.ws.close();
        } catch {
            // ignore
        }
        // Every caller still awaiting a reply must learn
        // the socket died. send() is not wrapped in a
        // timeout, so an entry left in the map is a
        // promise that can never settle — the caller
        // waits forever. Snapshot and clear before
        // rejecting so no handler can re-enter the map.
        const orphans = [...this.pending.values()];
        this.pending.clear();
        for (const orphan of orphans) {
            orphan.reject(new Error(SOCKET_CLOSED));
        }
    }
}

export async function evaluateJson<T>(
    cdp: CdpClient,
    expression: string,
    sessionId?: string,
): Promise<T> {
    const result = await cdp.send(
        'Runtime.evaluate',
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
        },
        sessionId,
    ) as {
        result?: {
            value?: T;
            type?: string;
            subtype?: string;
            description?: string;
        };
        exceptionDetails?: {
            text?: string;
            exception?: { description?: string };
        };
    };
    if (result.exceptionDetails !== undefined) {
        const d = result.exceptionDetails;
        throw new Error(
            'Runtime.evaluate threw: '
            + (d.exception?.description
                ?? d.text
                ?? 'unknown'),
        );
    }
    return result.result?.value as T;
}

export async function pageNavigate(
    cdp: CdpClient,
    url: string,
    sessionId?: string,
): Promise<void> {
    await cdp.send('Page.navigate', { url }, sessionId);
}

export async function clickSelector(
    cdp: CdpClient,
    selector: string,
    sessionId?: string,
): Promise<void> {
    const ok = await evaluateJson<boolean>(
        cdp,
        `(() => {
            const el = document.querySelector(
                ${JSON.stringify(selector)}
            );
            if (!el) return false;
            el.click();
            return true;
        })()`,
        sessionId,
    );
    if (!ok) {
        throw new Error(
            `click failed: selector not found: `
            + selector,
        );
    }
}

export async function waitForSelector(
    cdp: CdpClient,
    selector: string,
    label: string,
    timeoutMs: number,
    sessionId?: string,
): Promise<void> {
    await pollUntil(
        label,
        timeoutMs,
        async () => evaluateJson<boolean>(
            cdp,
            `!!document.querySelector(
                ${JSON.stringify(selector)}
            )`,
            sessionId,
        ),
    );
}

export class CdpSession {
    readonly client: CdpClient;
    readonly sessionId: string;

    constructor(client: CdpClient, sessionId: string) {
        this.client = client;
        this.sessionId = sessionId;
    }

    send(
        method: string,
        params?: Record<string, unknown>,
    ): Promise<unknown> {
        return this.client.send(
            method, params, this.sessionId,
        );
    }

    evaluate<T>(expression: string): Promise<T> {
        return evaluateJson<T>(
            this.client, expression, this.sessionId,
        );
    }
}

export function launchChrome(options: {
    readonly userDataDir: string;
    readonly windowSize?: string;
}): Deno.ChildProcess {
    const args = [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${options.userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
    ];
    if (options.windowSize !== undefined) {
        args.push(`--window-size=${options.windowSize}`);
    }
    args.push('about:blank');
    const child = new Deno.Command(chromeBinary(), {
        args,
        stdout: 'null',
        stderr: 'null',
    }).spawn();
    child.unref();
    return child;
}

export async function browserWsUrl(
    debugPort: number,
): Promise<string> {
    const res = await fetch(
        `http://127.0.0.1:${debugPort}/json/version`,
    );
    if (!res.ok) {
        throw new Error(
            'Chrome /json/version answered ' + res.status,
        );
    }
    const info = await res.json() as {
        webSocketDebuggerUrl?: string;
    };
    if (info.webSocketDebuggerUrl === undefined) {
        throw new Error(
            'Chrome /json/version has no'
            + ' webSocketDebuggerUrl',
        );
    }
    return info.webSocketDebuggerUrl;
}

function exists(path: string): boolean {
    try {
        Deno.statSync(path);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
}

export async function waitDevtoolsPort(
    userDataDir: string,
    timeoutMs: number,
): Promise<number> {
    const path = join(
        userDataDir,
        'DevToolsActivePort',
    );
    return pollUntil(
        'Chrome DevToolsActivePort',
        timeoutMs,
        async () => {
            if (!exists(path)) {
                return null;
            }
            const text = Deno.readTextFileSync(path).trim();
            if (text.length === 0) {
                return null;
            }
            const line = text.split('\n')[0];
            if (line === undefined) {
                return null;
            }
            const port = Number(line);
            if (
                !Number.isFinite(port)
                || port <= 0
            ) {
                return null;
            }
            return port;
        },
    );
}

export async function pageWsUrl(
    debugPort: number,
): Promise<string> {
    const base =
        `http://127.0.0.1:${debugPort}`;
    return pollUntil(
        'Chrome page target list',
        CHROME_READY_MS,
        async () => {
            try {
                const res = await fetch(
                    `${base}/json/list`,
                );
                if (!res.ok) return null;
                const list = await res.json() as
                    Array<{
                        type?: string;
                        webSocketDebuggerUrl?:
                            string;
                    }>;
                const page = list.find(
                    (t) =>
                        t.type === 'page'
                        && t.webSocketDebuggerUrl,
                );
                return page?.webSocketDebuggerUrl
                    ?? null;
            } catch {
                return null;
            }
        },
    );
}
