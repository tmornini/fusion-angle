// Tier 2 fixtures: an in-process origin on the memory
// backend, one Chrome per file, one browser context per
// test, compositor input, condition waits. Runs only
// under ./test-browser (FUSION_ANGLE_STATIC_ROOT).

import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../../api/db-memory.ts';
import {
    postMockDataLoad,
    type SeededCredentials,
} from '../../api/mock-data.ts';
import { buildMembers } from
    '../../api/mock-data/members.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { listenHttp } from
    '../../server/http-server.ts';
import { testHashPassword } from '../mock-seed.ts';
import { organizationToken } from
    '../token-fixtures.ts';
import {
    CHROME_READY_MS,
    CdpClient,
    CdpSession,
    type KillableChild,
    browserWsUrl,
    killProcessTree,
    launchChrome,
    pollUntil,
    sleep,
    waitDevtoolsPort,
} from '../../web-app/app/cdp-client.ts';
import {
    ELEMENT_TIMEOUT_MS,
    LOGIN_TIMEOUT_MS,
    login,
    waitPageReady,
} from '../../web-app/app/browser-drive.ts';

export const ADMIN_EMAIL = 'demo@example.com';
export const SECOND_EMAIL = 'sarah.chen@company.com';
export const VIEWPORT = { width: 1280, height: 800 };
const CONDITION_TIMEOUT_MS = 10_000;
const DRAG_STEPS = 8;
const STAY_SAMPLE_MS = 50;

export type Origin = {
    readonly baseUrl: string;
    readonly db: MemoryDbAdapter;
    readonly credentials: SeededCredentials;
    close(): Promise<void>;
};

export async function startOrigin(): Promise<Origin> {
    const staticRoot =
        Deno.env.get('FUSION_ANGLE_STATIC_ROOT');
    if (staticRoot === undefined || staticRoot === '') {
        throw new Error(
            'FUSION_ANGLE_STATIC_ROOT is required'
            + ' (run ./test-browser)',
        );
    }
    const db = memoryDbAdapter();
    const credentials = await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    const listener = await listenHttp({
        adapter: db,
        staticRoot,
        port: 0,
        host: '127.0.0.1',
    });
    return {
        baseUrl: `http://127.0.0.1:${listener.port}`,
        db,
        credentials,
        close: () => listener.close(),
    };
}

export function passwordOf(
    credentials: SeededCredentials,
    email: string,
): string {
    const row = credentials.identities.find(
        (i) => i.username === email,
    );
    if (row === undefined) {
        throw new Error(
            `no seeded credential for ${email}`,
        );
    }
    return row.password;
}

export async function adminToken(): Promise<string> {
    const admin = buildMembers().find(
        (m) => m.email === ADMIN_EMAIL,
    );
    if (admin === undefined) {
        throw new Error('mock seed has no demo admin');
    }
    return organizationToken(
        admin.id, STARK_ORGANIZATION,
    );
}

export type Point = { readonly x: number; readonly y: number };
export type Rect = Point & {
    readonly width: number;
    readonly height: number;
};

const KEY_CODES: Record<string, [string, number]> = {
    Tab: ['Tab', 9],
    Enter: ['Enter', 13],
    Escape: ['Escape', 27],
    Backspace: ['Backspace', 8],
    Delete: ['Delete', 46],
    ArrowUp: ['ArrowUp', 38],
    ArrowDown: ['ArrowDown', 40],
    Shift: ['ShiftLeft', 16],
    ' ': ['Space', 32],
};

export const SHIFT = 8;

export class Page {
    private readonly client: CdpClient;
    readonly session: CdpSession;
    readonly targetId: string;
    readonly contextId: string;

    constructor(
        client: CdpClient,
        session: CdpSession,
        targetId: string,
        contextId: string,
    ) {
        this.client = client;
        this.session = session;
        this.targetId = targetId;
        this.contextId = contextId;
    }

    evaluate<T>(expression: string): Promise<T> {
        return this.session.evaluate<T>(expression);
    }

    async navigate(url: string): Promise<void> {
        await this.session.send('Page.navigate', { url });
    }

    ready(label: string): Promise<unknown> {
        return waitPageReady(
            this.client, label, LOGIN_TIMEOUT_MS,
            this.session.sessionId,
        );
    }

    waitFor(
        selector: string,
        timeoutMs = ELEMENT_TIMEOUT_MS,
    ): Promise<boolean> {
        return this.until(
            `!!document.querySelector(${
                JSON.stringify(selector)})`,
            `selector ${selector}`, timeoutMs,
        );
    }

    until<T>(
        expression: string,
        label: string,
        timeoutMs = CONDITION_TIMEOUT_MS,
    ): Promise<T> {
        return pollUntil<T>(
            label, timeoutMs,
            () => this.evaluate<T | false | null>(
                expression,
            ),
        );
    }

    async rect(selector: string, index = 0): Promise<Rect> {
        const r = await this.evaluate<Rect | null>(
            `(() => {
                const el = [...document.querySelectorAll(${
                    JSON.stringify(selector)})][${index}];
                if (!el) return null;
                const b = el.getBoundingClientRect();
                return { x: b.x, y: b.y,
                    width: b.width, height: b.height };
            })()`,
        );
        if (r === null) {
            throw new Error(
                `no element ${selector}[${index}]`,
            );
        }
        return r;
    }

    async center(
        selector: string, index = 0,
    ): Promise<Point> {
        const r = await this.rect(selector, index);
        return {
            x: r.x + r.width / 2,
            y: r.y + r.height / 2,
        };
    }

    async click(selector: string): Promise<void> {
        const p = await this.center(selector);
        await this.press(p);
        await this.release(p);
    }

    press(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mousePressed', x: pt.x, y: pt.y,
                button: 'left', clickCount: 1,
                modifiers,
            },
        );
    }

    move(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseMoved', x: pt.x, y: pt.y,
                button: 'left', buttons: 1, modifiers,
            },
        );
    }

    release(pt: Point, modifiers = 0): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseReleased', x: pt.x, y: pt.y,
                button: 'left', clickCount: 1,
                modifiers,
            },
        );
    }

    async drag(
        from: Point,
        to: Point,
        options: { steps?: number; modifiers?: number }
            = {},
    ): Promise<void> {
        const steps = options.steps ?? DRAG_STEPS;
        const modifiers = options.modifiers ?? 0;
        await this.press(from, modifiers);
        for (let i = 1; i <= steps; i += 1) {
            await this.move({
                x: from.x + (to.x - from.x) * i / steps,
                y: from.y + (to.y - from.y) * i / steps,
            }, modifiers);
        }
        await this.release(to, modifiers);
    }

    async keyDown(name: string, modifiers = 0):
    Promise<void> {
        const [code, vk] = keyCodeOf(name);
        const printable = name.length === 1;
        await this.session.send(
            'Input.dispatchKeyEvent', {
                type: printable ? 'keyDown' : 'rawKeyDown',
                key: name, code,
                windowsVirtualKeyCode: vk, modifiers,
                ...(printable ? { text: name } : {}),
            },
        );
    }

    async keyUp(name: string, modifiers = 0):
    Promise<void> {
        const [code, vk] = keyCodeOf(name);
        await this.session.send(
            'Input.dispatchKeyEvent', {
                type: 'keyUp', key: name, code,
                windowsVirtualKeyCode: vk, modifiers,
            },
        );
    }

    async key(name: string, modifiers = 0):
    Promise<void> {
        await this.keyDown(name, modifiers);
        await this.keyUp(name, modifiers);
    }

    setViewport(
        width: number, height: number, mobile: boolean,
    ): Promise<unknown> {
        return this.session.send(
            'Emulation.setDeviceMetricsOverride', {
                width, height, deviceScaleFactor: 1,
                mobile,
            },
        );
    }

    emulateMedia(
        features: ReadonlyArray<{
            name: string; value: string;
        }>,
    ): Promise<unknown> {
        return this.session.send(
            'Emulation.setEmulatedMedia', { features },
        );
    }

    async close(): Promise<void> {
        await this.client.send(
            'Target.closeTarget', { targetId: this.targetId },
        );
    }
}

function keyCodeOf(name: string): [string, number] {
    const entry = KEY_CODES[name];
    if (entry === undefined) {
        throw new Error(`no key code for ${name}`);
    }
    return entry;
}

export class Browser {
    readonly client: CdpClient;
    private readonly chrome: KillableChild | null;
    private readonly userDataDir: string | null;

    private constructor(
        client: CdpClient,
        chrome: KillableChild | null,
        userDataDir: string | null,
    ) {
        this.client = client;
        this.chrome = chrome;
        this.userDataDir = userDataDir;
    }

    static async launch(): Promise<Browser> {
        const attach = Deno.env.get('CHROME_DEBUG_URL');
        if (attach !== undefined && attach !== '') {
            return new Browser(
                await CdpClient.connect(attach), null, null,
            );
        }
        // makeTempDirSync honours TMPDIR itself.
        const userDataDir = Deno.makeTempDirSync({
            prefix: 'fusion-browser-',
        });
        // launchChrome spawns detached and unrefs, so an
        // orphan outlives this process and holds its
        // profile. Release both on every failure path,
        // then rethrow — the caller must still see why.
        let chrome: KillableChild | null = null;
        try {
            chrome = launchChrome({
                userDataDir,
                windowSize:
                    `${VIEWPORT.width},${VIEWPORT.height}`,
            });
            const port = await waitDevtoolsPort(
                userDataDir, CHROME_READY_MS,
            );
            const client = await CdpClient.connect(
                await browserWsUrl(port),
            );
            return new Browser(
                client, chrome, userDataDir,
            );
        } catch (error) {
            // killProcessTree walks a ps snapshot and can
            // throw, so the profile's removal nests inside
            // it rather than following it.
            try {
                killProcessTree(chrome);
            } finally {
                Deno.removeSync(userDataDir, {
                    recursive: true,
                });
            }
            throw error;
        }
    }

    async newPage(): Promise<Page> {
        const created = await this.client.send(
            'Target.createBrowserContext',
        ) as { browserContextId: string };
        // The caller disposes the context through the id
        // the Page carries, so a newPageIn reject would
        // strand a Chrome-side context nobody can name.
        // Dispose it here, then rethrow the real failure.
        try {
            return await this.newPageIn(
                created.browserContextId,
            );
        } catch (error) {
            // disposeContext can reject too, and a failed
            // cleanup must not replace the failure that
            // caused it: report it, then throw the real one.
            try {
                await this.disposeContext(
                    created.browserContextId,
                );
            } catch (disposeError) {
                console.error(
                    'disposeContext failed after'
                    + ' newPageIn rejected',
                    disposeError,
                );
            }
            throw error;
        }
    }

    async newPageIn(contextId: string): Promise<Page> {
        const target = await this.client.send(
            'Target.createTarget', {
                url: 'about:blank',
                browserContextId: contextId,
            },
        ) as { targetId: string };
        const attached = await this.client.send(
            'Target.attachToTarget', {
                targetId: target.targetId, flatten: true,
            },
        ) as { sessionId: string };
        const session = new CdpSession(
            this.client, attached.sessionId,
        );
        await session.send('Page.enable');
        await session.send('Runtime.enable');
        await session.send('Network.enable');
        await session.send(
            'Emulation.setDeviceMetricsOverride', {
                width: VIEWPORT.width,
                height: VIEWPORT.height,
                deviceScaleFactor: 1, mobile: false,
            },
        );
        await session.send(
            'Emulation.setFocusEmulationEnabled',
            { enabled: true },
        );
        await session.send('Page.bringToFront');
        return new Page(
            this.client, session, target.targetId,
            contextId,
        );
    }

    async disposeContext(contextId: string):
    Promise<void> {
        await this.client.send(
            'Target.disposeBrowserContext',
            { browserContextId: contextId },
        );
    }

    // Each release runs even if the one before it
    // throws. killProcessTree can, and a throw between
    // the socket and the profile would leave a detached
    // Chrome holding a directory nothing later removes.
    async close(): Promise<void> {
        try {
            this.client.close();
        } finally {
            try {
                killProcessTree(this.chrome);
            } finally {
                if (this.userDataDir !== null) {
                    Deno.removeSync(this.userDataDir, {
                        recursive: true,
                    });
                }
            }
        }
    }
}

export function useBrowser(): { get(): Browser } {
    let browser: Browser | null = null;
    Deno.test.beforeAll(async () => {
        browser = await Browser.launch();
    });
    Deno.test.afterAll(async () => {
        await browser?.close();
    });
    return {
        get: () => {
            if (browser === null) {
                throw new Error('browser not launched');
            }
            return browser;
        },
    };
}

export async function signIn(
    page: Page, origin: Origin, email: string,
): Promise<void> {
    await login(
        page.session.client, origin.baseUrl, email,
        passwordOf(origin.credentials, email),
        page.session.sessionId,
    );
}

// A dead CDP socket strands every in-flight send —
// CdpClient never rejects its pending map on close.
// ./test-browser gates ./crank, where a hang is
// strictly worse than a failure: a failure names the
// test, a hang names nothing and takes the whole
// checkpoint with it. 120s clears the largest single
// legitimate wait (the 60s page:ready) twice over, so
// an internal timeout fires first and reports itself
// by name. deno test has no per-test timeout flag.
// The race wraps startOrigin, newPage, signIn, the
// body, and cleanup: dispose on a dead socket must
// not pin withAdminPage's await.
export const TEST_BODY_TIMEOUT_MS = 120_000;

export async function withTimeout<T>(
    work: Promise<T>,
    name: string,
    timeoutMs = TEST_BODY_TIMEOUT_MS,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(
                `${name} timed out after ${timeoutMs}ms`,
            ));
        }, timeoutMs);
    });
    try {
        return await Promise.race([work, bound]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

export async function withAdminPage(
    browser: Browser,
    fn: (page: Page, origin: Origin) => Promise<void>,
): Promise<void> {
    await withTimeout((async () => {
        // One try per acquisition, so a later failure
        // still releases the earlier resource. Disposing
        // the context closes its targets, so page.close()
        // is redundant — and a redundant reject would
        // strand the listener.
        const origin = await startOrigin();
        try {
            const page = await browser.newPage();
            try {
                await signIn(page, origin, ADMIN_EMAIL);
                await fn(page, origin);
            } finally {
                await browser.disposeContext(
                    page.contextId,
                );
            }
        } finally {
            await origin.close();
        }
    })(), 'withAdminPage');
}

// A bounded negative assertion: the expression keeps
// its first value for windowMs (a navigation would
// change it or kill the context).
export async function stays(
    page: Page, expression: string, windowMs: number,
): Promise<void> {
    const first = await page.evaluate<unknown>(expression);
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
        await sleep(STAY_SAMPLE_MS);
        const now = await page.evaluate<unknown>(expression);
        if (now !== first) {
            throw new Error(
                `${expression} changed: ${String(first)}`
                + ` -> ${String(now)}`,
            );
        }
    }
}
