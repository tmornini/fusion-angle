// Node-only CDP transport, Chrome launch, and waits.
// Shared by ./measure and ./test-browser. Excluded from
// the browser tsc (Node APIs + global WebSocket), like
// measure.ts.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

export const CHROME_READY_MS = 15_000;
export const POLL_MS = 200;

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
    if (process.env.CHROME) {
        return process.env.CHROME;
    }
    if (platform() === 'darwin') {
        return '/Applications/Google Chrome.app'
            + '/Contents/MacOS/Google Chrome';
    }
    throw new Error(
        'Chrome not found: set CHROME to the browser'
        + ' binary path (no default outside macOS)',
    );
}

export function killProcessTree(
    child: ChildProcess | null,
): void {
    if (child === null || child.pid === undefined) {
        return;
    }
    try {
        // Negative PID = process group (spawn detached).
        process.kill(-child.pid, 'SIGTERM');
    } catch {
        try {
            child.kill('SIGTERM');
        } catch {
            // already gone
        }
    }
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        try {
            child.kill('SIGKILL');
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
        try {
            this.ws.close();
        } catch {
            // ignore
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
}): ChildProcess {
    const args = [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${options.userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-gpu',
    ];
    if (options.windowSize !== undefined) {
        args.push(`--window-size=${options.windowSize}`);
    }
    args.push('about:blank');
    const child = spawn(
        chromeBinary(), args,
        { stdio: 'ignore', detached: true },
    );
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
            if (!existsSync(path)) {
                return null;
            }
            const text = readFileSync(
                path, 'utf8',
            ).trim();
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
