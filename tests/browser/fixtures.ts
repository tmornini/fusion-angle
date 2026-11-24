// Tier 2 fixtures: an in-process origin on the memory
// backend, one mock seed per run, one Chrome per file,
// one browser context per test, compositor input,
// condition waits. Runs only under ./bin/test browser
// (FUSION_ANGLE_STATIC_ROOT).

import { MemoryStorageBackend } from
    '../../api/backend-memory.ts';
import {
    memoryDbAdapterOver,
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
import {
    type HttpListenOptions,
    listenHttp,
} from '../../server/http-server.ts';
import { testHashPassword } from '../mock-seed.ts';
import { organizationToken } from
    '../token-fixtures.ts';
import {
    CHROME_READY_MS,
    CdpClient,
    CdpSession,
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
const HELD_TIMEOUT_MS = 5_000;
// A killed Chrome exits in milliseconds. Past this bound
// the wait fails by name; its profile is removed anyway.
const CHROME_EXIT_TIMEOUT_MS = 10_000;
const PROFILE_REMOVAL_ATTEMPTS = 3;
const PROFILE_REMOVAL_BACKOFF_MS = 100;
const DIRECTORY_NOT_EMPTY = 'ENOTEMPTY';

export type Origin = {
    readonly baseUrl: string;
    readonly db: MemoryDbAdapter;
    readonly credentials: SeededCredentials;
    close(): Promise<void>;
};

type FileSeed = {
    readonly backend: MemoryStorageBackend;
    readonly credentials: SeededCredentials;
};

// ./bin/test browser lands one mock seed for the run before
// any file starts and names its file here. A file run
// alone with deno test has none named and seeds its own.
export const RUN_SEED_ENV = 'FUSION_ANGLE_BROWSER_SEED';
// Read-only for everyone: written once, then only read.
const RUN_SEED_MODE = 0o444;

type RunSeed = {
    readonly rows: readonly { readonly id: string }[];
    readonly credentials: SeededCredentials;
};

async function seedMockData(): Promise<FileSeed> {
    const backend = new MemoryStorageBackend();
    const credentials = await postMockDataLoad(
        memoryDbAdapterOver(backend),
        { hashPassword: testHashPassword },
    );
    return { backend, credentials };
}

// Writes a seed's rows and sign-ins to a file that must not
// exist yet, read-only once written.
export async function writeRunSeed(
    path: string,
    seed: FileSeed,
): Promise<void> {
    const runSeed: RunSeed = {
        rows: await seed.backend.read((tx) => tx.getAll()),
        credentials: seed.credentials,
    };
    await Deno.writeTextFile(path, JSON.stringify(runSeed), {
        createNew: true, mode: RUN_SEED_MODE,
    });
}

// Seeds once and writes what landed.
export async function landRunSeed(
    path: string,
): Promise<FileSeed> {
    const seed = await seedMockData();
    await writeRunSeed(path, seed);
    return seed;
}

function isStringRecord(
    value: unknown,
): value is Readonly<Record<string, string>> {
    return typeof value === 'object' && value !== null
        && !Array.isArray(value)
        && Object.values(value).every(
            (field) => typeof field === 'string',
        );
}

function isSeedRow(
    value: unknown,
): value is { readonly id: string } {
    return isStringRecord(value)
        && typeof value['id'] === 'string';
}

function isCredential(value: unknown): boolean {
    return isStringRecord(value)
        && typeof value['identityId'] === 'string'
        && typeof value['username'] === 'string'
        && typeof value['password'] === 'string';
}

// The file was written by this run, but it crosses a
// process boundary, so it is read at the gate.
function runSeedOf(path: string, text: string): RunSeed {
    const refused = new Error(`${path} is not a run seed`);
    // The parser's message quotes the text around a bad
    // token, and the file holds sign-ins: none of it goes
    // into the refusal.
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw refused;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw refused;
    }
    const { rows, credentials } =
        parsed as Record<string, unknown>;
    if (
        !Array.isArray(rows) || !rows.every(isSeedRow)
        || typeof credentials !== 'object'
        || credentials === null
    ) {
        throw refused;
    }
    const { identities } =
        credentials as Record<string, unknown>;
    if (
        !Array.isArray(identities)
        || !identities.every(isCredential)
    ) {
        throw refused;
    }
    return {
        rows,
        credentials: credentials as SeededCredentials,
    };
}

// The landed rows, appended in the order they landed to a
// backend that has no table yet: the rows the seed left,
// in a backend of this file's own.
async function rebuiltFrom(
    path: string,
    rows: RunSeed['rows'],
): Promise<MemoryStorageBackend> {
    const backend = new MemoryStorageBackend();
    await backend.seedTransaction(async (tx) => {
        for (const row of rows) {
            if (!await tx.append(row)) {
                throw new Error(
                    `${path} repeats row ${row.id}`,
                );
            }
        }
    });
    return backend;
}

// No path named: seed. A path named: rebuild from it, and
// a file that cannot be read fails rather than seeds.
export async function fileSeedFrom(
    path: string | undefined,
): Promise<FileSeed> {
    if (path === undefined) {
        return seedMockData();
    }
    if (path === '') {
        throw new Error(`${RUN_SEED_ENV} names no file`);
    }
    const runSeed = runSeedOf(
        path, await Deno.readTextFile(path),
    );
    return {
        backend: await rebuiltFrom(path, runSeed.rows),
        credentials: runSeed.credentials,
    };
}

// A file takes its seed once and never serves or writes
// it again. Rows are appended and never changed in place,
// so each origin takes them under a backend of its own.
let fileSeed: Promise<FileSeed> | undefined;

function seededOnce(): Promise<FileSeed> {
    fileSeed ??= fileSeedFrom(Deno.env.get(RUN_SEED_ENV));
    return fileSeed;
}

// A status test fixes the commit, so no refresh waits on
// git, and widens the API's wait past a loaded machine's.
export async function startOrigin(
    status?: Pick<HttpListenOptions, 'commit' | 'apiStatusWaitMs'>,
): Promise<Origin> {
    const staticRoot =
        Deno.env.get('FUSION_ANGLE_STATIC_ROOT');
    if (staticRoot === undefined || staticRoot === '') {
        throw new Error(
            'FUSION_ANGLE_STATIC_ROOT is required'
            + ' (run ./bin/test browser)',
        );
    }
    const seed = await seededOnce();
    const db = memoryDbAdapterOver(seed.backend.copy());
    const listener = await listenHttp({
        adapter: db,
        staticRoot,
        port: 0,
        host: '127.0.0.1',
        ...status,
    });
    return {
        baseUrl: `http://127.0.0.1:${listener.port}`,
        db,
        credentials: seed.credentials,
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
    ArrowLeft: ['ArrowLeft', 37],
    ArrowRight: ['ArrowRight', 39],
    '+': ['Equal', 187],
    '=': ['Equal', 187],
    '-': ['Minus', 189],
    Shift: ['ShiftLeft', 16],
    ' ': ['Space', 32],
    '/': ['Slash', 191],
};

// Input.dispatch*Event's modifier bits.
export const ALT = 1;
export const CTRL = 2;
export const META = 4;
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

    hover(pt: Point): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseMoved', x: pt.x, y: pt.y,
                button: 'none', buttons: 0, modifiers: 0,
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

    wheel(pt: Point, deltaY: number): Promise<unknown> {
        return this.session.send(
            'Input.dispatchMouseEvent', {
                type: 'mouseWheel', x: pt.x, y: pt.y,
                deltaX: 0, deltaY,
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

    // Text into the focused field, at its caret, as an
    // input method commits it: `input` fires, no key
    // event does.
    type(text: string): Promise<unknown> {
        return this.session.send(
            'Input.insertText', { text },
        );
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

// A helper Chrome started after the kill's ps snapshot can
// still write into the profile while it is removed, and
// the removal then answers not empty. That is transient:
// try again, backing off, a bounded number of times.
async function removeProfile(userDataDir: string):
Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            Deno.removeSync(userDataDir, { recursive: true });
            return;
        } catch (error) {
            const code = (error as { code?: unknown }).code;
            if (
                attempt === PROFILE_REMOVAL_ATTEMPTS
                || code !== DIRECTORY_NOT_EMPTY
            ) {
                throw error;
            }
        }
        await sleep(
            PROFILE_REMOVAL_BACKOFF_MS * 2 ** (attempt - 1)
                * (1 + Math.random()),
        );
    }
}

// Kills Chrome, waits for it to exit, then removes its
// profile. A Chrome still exiting writes into its
// profile: removed first, the directory either answers
// not empty or keeps what the late write puts back.
// killProcessTree walks a ps snapshot and can throw, and
// the wait can time out, so the removal is their finally.
export async function releaseChrome(
    chrome: Deno.ChildProcess | null,
    userDataDir: string,
): Promise<void> {
    try {
        killProcessTree(chrome);
        if (chrome !== null) {
            await withTimeout(
                chrome.status, 'Chrome exit',
                CHROME_EXIT_TIMEOUT_MS,
            );
        }
    } finally {
        await removeProfile(userDataDir);
    }
}

export class Browser {
    readonly client: CdpClient;
    private readonly chrome: Deno.ChildProcess | null;
    private readonly userDataDir: string | null;

    private constructor(
        client: CdpClient,
        chrome: Deno.ChildProcess | null,
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
        let chrome: Deno.ChildProcess | null = null;
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
            await releaseChrome(chrome, userDataDir);
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

    // The Chrome is released even if closing the socket
    // throws: a throw between the socket and the profile
    // would leave a detached Chrome holding a directory
    // nothing later removes. An attached Chrome is not
    // this fixture's to release.
    async close(): Promise<void> {
        try {
            this.client.close();
        } finally {
            if (this.userDataDir !== null) {
                await releaseChrome(
                    this.chrome, this.userDataDir,
                );
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
// ./bin/deploy --local runs ./bin/test browser, where a hang is
// strictly worse than a failure: a failure names the
// test, a hang names nothing and takes the whole
// checkpoint with it. 120s clears the largest single
// legitimate wait (the 60s page:ready) twice over, so
// an internal timeout fires first and reports itself
// by name. deno test has no per-test timeout flag.
// The race wraps startOrigin, newPage, signIn, the
// body, and cleanup: dispose on a dead socket must
// not pin withAdminPage's await.
const TEST_BODY_TIMEOUT_MS = 120_000;

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

// A request the page sends, as a hold's predicate sees it.
export type PausedRequest = {
    readonly method: string;
    readonly url: string;
};

// The requests a hold keeps at the browser's network layer
// (CDP Fetch) until the test releases or fails each one.
export type RequestHold = {
    // The next held request, taken from the held list.
    next(): Promise<string>;
    heldCount(): number;
    heldAtLeast(count: number): Promise<unknown>;
    release(requestId: string): Promise<unknown>;
    fail(requestId: string): Promise<unknown>;
    // Later requests pass; the held ones stay held.
    stopHolding(): void;
    // Releases every request still on the held list.
    releaseHeld(): Promise<void>;
};

// Holds the page's requests under urlPattern that `holds`
// picks, while fn runs; every other request passes. The
// interception detaches when fn settles, which lets any
// request still paused go on.
export async function withHeldRequests(
    page: Page,
    urlPattern: string,
    holds: (request: PausedRequest) => boolean,
    fn: (hold: RequestHold) => Promise<void>,
): Promise<void> {
    const session = page.session;
    const held: string[] = [];
    let holding = true;
    const release = (requestId: string) => session.send(
        'Fetch.continueRequest', { requestId },
    );
    const off = session.client.on(
        'Fetch.requestPaused',
        (params, sessionId) => {
            if (sessionId !== session.sessionId) return;
            const paused = params as {
                readonly requestId: string;
                readonly request: PausedRequest;
            };
            if (holding && holds(paused.request)) {
                held.push(paused.requestId);
                return;
            }
            void release(paused.requestId);
        },
    );
    try {
        await session.send('Fetch.enable', {
            patterns: [{ urlPattern, requestStage: 'Request' }],
        });
        await fn({
            next: () => pollUntil(
                'a held request', HELD_TIMEOUT_MS,
                () => Promise.resolve(held.shift()),
            ),
            heldCount: () => held.length,
            heldAtLeast: (count) => pollUntil(
                'held requests', HELD_TIMEOUT_MS,
                () => Promise.resolve(
                    held.length >= count || null,
                ),
            ),
            release,
            fail: (requestId) => session.send(
                'Fetch.failRequest',
                { requestId, errorReason: 'Failed' },
            ),
            stopHolding: () => {
                holding = false;
            },
            releaseHeld: async () => {
                await Promise.all(held.splice(0).map(release));
            },
        });
    } finally {
        off();
        await session.send('Fetch.disable');
    }
}
