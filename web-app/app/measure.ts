// Node-only CDP page-load benchmark harness.
// Run via ./measure from the repo root (see that wrapper).
// Excluded from browser tsc; uses Node APIs + global WebSocket.
//
// Flow: optional bare --visualize (disk only) → clean-tree
// gate → build → serve → Chrome → seed → login →
// detail-URL discovery → N-run sweep → report → optional
// --check / --record / --visualize. Cleanup always in
// finally.

import {
    appendFileSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import {
    spawn,
    execFile as execFileCb,
    type ChildProcess,
} from 'node:child_process';
import { createServer } from 'node:net';
import {
    cpus,
    platform,
    arch,
    tmpdir as osTmpdir,
} from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { PAGE_REGISTRY } from './page-registry.ts';
import {
    statsForPage,
    compareBudgets,
    shapeHistoryLine,
    formatReport,
    budgetReadyMsFromSamples,
    type PageRun,
    type PageStats,
    type Budgets,
} from './measure-core.ts';
import { generateMeasureViz } from './measure-viz.ts';
import {
    DEFAULT_PROFILE_PAGES,
    formatRequestProfileReport,
    type ApiRequestHit,
} from './measure-profile-core.ts';

const execFile = promisify(execFileCb);

const DEMO_EMAIL = 'demo@example.com';
const DEFAULT_RUNS = 5;
const DEFAULT_BUDGET_SIGMAS = 1.5;
const CHROME_READY_MS = 15_000;
const SEED_TIMEOUT_MS = 120_000;
const LOGIN_TIMEOUT_MS = 60_000;
const PAGE_READY_MS = 120_000;
const ELEMENT_TIMEOUT_MS = 30_000;
const POLL_MS = 200;
const BUDGETS_PATH = 'measurements/budgets.json';
const HISTORY_PATH = 'measurements/history.jsonl';

// Detail pages whose URL must be scraped from a list page.
const DETAIL_FROM_LIST: Record<string, string> = {
    'idea-detail': 'ideas',
    'project-detail': 'projects',
    'flow-detail': 'flows',
    'record-detail': 'records',
    'member-detail': 'members',
    'identity-detail': 'identities',
    'workbox-detail': 'workbox',
};

// ── CLI ──────

type Cli = {
    check: boolean;
    record: boolean;
    writeBudgets: boolean;
    budgetSigmas: number;
    pages: string[] | null;
    runs: number;
    visualize: boolean;
    /** API request-count profile after each ready. */
    profile: boolean;
    /** True when --runs was present on argv. */
    runsExplicit: boolean;
};

type ParseResult =
    | { kind: 'ok'; cli: Cli }
    | { kind: 'help' }
    | { kind: 'error'; message: string };

function usageText(): string {
    return [
        'Usage: ./measure [options]',
        '',
        'Page-load benchmark via headless Chrome + CDP.',
        'Stats drop the top and bottom 5% of samples',
        '(floor(n×0.05) per tail; n < 20 keeps all).',
        '',
        'Options:',
        '  --check              Fail if medians exceed',
        '                       budgets',
        '  --record             Append a history line',
        '                       under measurements/',
        '  --write-budgets      Write mean+kσ budgets',
        '                       (full registry only)',
        '  --budget-sigmas N    σ multiplier for',
        '                       --write-budgets',
        `                       (default ${DEFAULT_BUDGET_SIGMAS})`,
        '  --pages a,b,c        Subset of PAGE_REGISTRY',
        '                       keys',
        '  --runs N             Runs per page',
        `                       (default ${DEFAULT_RUNS})`,
        '  --visualize          Write measurements/',
        '                       index.html from disk',
        '                       history (bare = no',
        '                       Chrome; with a run,',
        '                       regenerate after)',
        '  --profile            Print API request counts',
        '                       + page-init residual per',
        '                       ready (default pages:',
        '                       organization, workbox,',
        '                       workbox-detail, projects;',
        '                       default --runs 1)',
        '  --help, -h           Show this help',
        '',
        'Examples:',
        '  ./measure',
        '  ./measure --pages dashboard,ideas --runs 30',
        '  ./measure --check --record --visualize',
        '  ./measure --write-budgets --runs 30',
        '  ./measure --visualize',
        '  ./measure --profile',
        '  ./measure --profile --pages ideas,dashboard',
        '',
    ].join('\n');
}

function parseArgs(argv: string[]): ParseResult {
    let check = false;
    let record = false;
    let writeBudgets = false;
    let budgetSigmas = DEFAULT_BUDGET_SIGMAS;
    let pages: string[] | null = null;
    let runs = DEFAULT_RUNS;
    let visualize = false;
    let profile = false;
    let runsExplicit = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === '--help' || a === '-h') {
            return { kind: 'help' };
        }
        if (a === '--check') {
            check = true;
            continue;
        }
        if (a === '--record') {
            record = true;
            continue;
        }
        if (a === '--write-budgets') {
            writeBudgets = true;
            continue;
        }
        if (a === '--visualize') {
            visualize = true;
            continue;
        }
        if (a === '--profile') {
            profile = true;
            continue;
        }
        if (a === '--budget-sigmas') {
            const v = argv[++i];
            if (
                v === undefined
                || !Number.isFinite(Number(v))
                || Number(v) < 0
            ) {
                return {
                    kind: 'error',
                    message:
                        '--budget-sigmas requires a'
                        + ' non-negative number',
                };
            }
            budgetSigmas = Number(v);
            continue;
        }
        if (a === '--pages') {
            const v = argv[++i];
            if (v === undefined || v.length === 0) {
                return {
                    kind: 'error',
                    message:
                        '--pages requires a'
                        + ' comma-separated list of'
                        + ' registry keys',
                };
            }
            pages = v.split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            if (pages.length === 0) {
                return {
                    kind: 'error',
                    message: '--pages list is empty',
                };
            }
            continue;
        }
        if (a === '--runs') {
            const v = argv[++i];
            if (
                v === undefined
                || !/^[1-9]\d*$/.test(v)
            ) {
                return {
                    kind: 'error',
                    message:
                        '--runs requires a positive'
                        + ' integer',
                };
            }
            runs = Number(v);
            runsExplicit = true;
            continue;
        }
        return {
            kind: 'error',
            message: `Unknown flag: ${a}`,
        };
    }
    if (writeBudgets && pages !== null) {
        return {
            kind: 'error',
            message:
                '--write-budgets requires a full'
                + ' registry sweep (omit --pages)',
        };
    }
    // Profile defaults: heaviest page-init pages, one
    // run (call counts are deterministic for a seed).
    if (profile && pages === null) {
        pages = [...DEFAULT_PROFILE_PAGES];
    }
    if (profile && !runsExplicit) {
        runs = 1;
    }
    return {
        kind: 'ok',
        cli: {
            check,
            record,
            writeBudgets,
            budgetSigmas,
            pages,
            runs,
            visualize,
            profile,
            runsExplicit,
        },
    };
}

// ── Small utils ──────

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function tmpRoot(): string {
    return process.env.TMPDIR || osTmpdir() || '/tmp';
}

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const s = createServer();
        s.listen(0, '127.0.0.1', () => {
            const addr = s.address();
            if (
                addr === null
                || typeof addr === 'string'
            ) {
                s.close();
                reject(
                    new Error(
                        'freePort: could not bind',
                    ),
                );
                return;
            }
            const port = addr.port;
            s.close((err) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
        s.on('error', reject);
    });
}

async function pollUntil<T>(
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

function registryUrl(
    baseUrl: string,
    key: string,
    query?: string,
): string {
    const entry = PAGE_REGISTRY[key];
    if (entry === undefined) {
        throw new Error(
            `Unknown page registry key: ${key}`,
        );
    }
    let url = `${baseUrl}/${entry.sourceDir}`
        + `/${entry.sourceFile}.html`;
    if (query !== undefined && query.length > 0) {
        url += `?${query}`;
    }
    return url;
}

function queryOf(url: string): string {
    const i = url.indexOf('?');
    return i >= 0 ? url.slice(i + 1) : '';
}

function chromeBinary(): string {
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

function killProcessTree(
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

// ── CDP client ──────

type CdpMessage = {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: { message: string; code?: number };
    sessionId?: string;
};

class CdpClient {
    private ws: WebSocket;
    private nextId = 1;
    private pending = new Map<number, {
        resolve: (v: unknown) => void;
        reject: (e: Error) => void;
    }>();

    private constructor(ws: WebSocket) {
        this.ws = ws;
        ws.addEventListener('message', (ev) => {
            this.onMessage(String(ev.data));
        });
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
    ): Promise<unknown> {
        const id = this.nextId++;
        const payload: Record<string, unknown> = {
            id,
            method,
        };
        if (params !== undefined) {
            payload.params = params;
        }
        return new Promise((resolve, reject) => {
            this.pending.set(id, {
                resolve,
                reject,
            });
            this.ws.send(JSON.stringify(payload));
        });
    }

    close(): void {
        try {
            this.ws.close();
        } catch {
            // ignore
        }
    }
}

// ── Page session helpers ──────

async function evaluateJson<T>(
    cdp: CdpClient,
    expression: string,
): Promise<T> {
    const result = await cdp.send(
        'Runtime.evaluate',
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
        },
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

async function pageNavigate(
    cdp: CdpClient,
    url: string,
): Promise<void> {
    await cdp.send('Page.navigate', { url });
}

async function clickSelector(
    cdp: CdpClient,
    selector: string,
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
    );
    if (!ok) {
        throw new Error(
            `click failed: selector not found: `
            + selector,
        );
    }
}

async function waitForSelector(
    cdp: CdpClient,
    selector: string,
    label: string,
    timeoutMs: number,
): Promise<void> {
    await pollUntil(
        label,
        timeoutMs,
        async () => evaluateJson<boolean>(
            cdp,
            `!!document.querySelector(
                ${JSON.stringify(selector)}
            )`,
        ),
    );
}

type ReadyHarvest = PageRun & {
    apiHits: ApiRequestHit[];
};

async function harvestReady(
    cdp: CdpClient,
): Promise<ReadyHarvest | null> {
    return evaluateJson<ReadyHarvest | null>(
        cdp,
        `(() => {
            const measures =
                performance.getEntriesByType(
                    'measure'
                );
            const m = measures.find(
                (e) => e.name === 'page:ready'
            );
            if (!m) return null;
            const phases = {};
            for (const e of measures) {
                if (
                    e.name.startsWith('boot:')
                    || e.name.startsWith('fetch:')
                    || e.name.startsWith('render:')
                ) {
                    phases[e.name] = e.duration;
                }
            }
            const g = globalThis;
            const apiHits =
                typeof g.__fusionApiRequestHits
                    === 'function'
                    ? g.__fusionApiRequestHits()
                    : [];
            return {
                readyMs: m.duration,
                phases,
                apiHits,
            };
        })()`,
    );
}

async function waitPageReady(
    cdp: CdpClient,
    pageLabel: string,
    timeoutMs: number,
): Promise<ReadyHarvest> {
    return pollUntil(
        `page:ready on ${pageLabel}`,
        timeoutMs,
        () => harvestReady(cdp),
    );
}

// ── Chrome launch ──────

async function waitDevtoolsPort(
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

async function pageWsUrl(
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

// ── Seed / login / discovery ──────

type CredLine = {
    user: string | null | undefined;
    secret: string | null | undefined;
};

async function seedMockData(
    cdp: CdpClient,
    baseUrl: string,
): Promise<string> {
    const snapsUrl = registryUrl(
        baseUrl, 'snapshots',
    );
    await pageNavigate(cdp, snapsUrl);
    await waitForSelector(
        cdp,
        '#reload-btn',
        'snapshots #reload-btn',
        ELEMENT_TIMEOUT_MS,
    );
    // page:ready may already have fired; either way
    // the seed control is the gate.
    await clickSelector(cdp, '#reload-btn');
    await waitForSelector(
        cdp,
        '#confirm-wipe-submit',
        'snapshots confirm-wipe dialog',
        ELEMENT_TIMEOUT_MS,
    );
    await clickSelector(
        cdp, '#confirm-wipe-submit',
    );
    await waitForSelector(
        cdp,
        '#credential-continue-btn',
        'seed credential reveal'
        + ' (#credential-continue-btn)',
        SEED_TIMEOUT_MS,
    );
    const creds = await evaluateJson<CredLine[]>(
        cdp,
        `Array.from(document.querySelectorAll(
            '.credential-reveal-line'
        )).map((line) => ({
            user: line.querySelector(
                '.credential-reveal-user'
            )?.textContent?.trim(),
            secret: line.querySelector(
                '.credential-reveal-secret'
            )?.textContent?.trim(),
        }))`,
    );
    const demo = creds.find(
        (c) => c.user === DEMO_EMAIL,
    );
    if (
        demo === undefined
        || demo.secret === undefined
        || demo.secret === null
        || demo.secret.length === 0
    ) {
        const available = creds
            .map((c) => c.user ?? '(missing user)')
            .join(', ');
        throw new Error(
            `Seed credentials missing ${DEMO_EMAIL}.`
            + ` Available users: ${available
                || '(none)'}`,
        );
    }
    await clickSelector(
        cdp, '#credential-continue-btn',
    );
    // Root redirect → auth when schema present.
    await pollUntil(
        'post-seed navigation off snapshots',
        ELEMENT_TIMEOUT_MS,
        async () => {
            const href = await evaluateJson<string>(
                cdp,
                'location.href',
            );
            return href.includes('/snapshots/')
                ? null
                : href;
        },
    );
    return demo.secret;
}

async function login(
    cdp: CdpClient,
    baseUrl: string,
    password: string,
): Promise<void> {
    const authUrl = registryUrl(baseUrl, 'auth');
    await pageNavigate(cdp, authUrl);
    await waitForSelector(
        cdp,
        '#email',
        'auth #email',
        ELEMENT_TIMEOUT_MS,
    );
    // page:ready on auth may fire; fill regardless.
    const filled = await evaluateJson<boolean>(
        cdp,
        `(() => {
            const email =
                document.querySelector('#email');
            const password =
                document.querySelector('#password');
            if (!email || !password) return false;
            email.focus();
            email.value = ${JSON.stringify(DEMO_EMAIL)};
            email.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            password.focus();
            password.value =
                ${JSON.stringify(password)};
            password.dispatchEvent(
                new Event('input', { bubbles: true })
            );
            return true;
        })()`,
    );
    if (!filled) {
        throw new Error(
            'Login failure: #email/#password missing'
            + ' on auth page',
        );
    }
    await clickSelector(cdp, '#submit-btn');
    await pollUntil(
        'login navigation away from auth',
        LOGIN_TIMEOUT_MS,
        async () => {
            const href = await evaluateJson<string>(
                cdp,
                'location.href',
            );
            if (href.includes('/auth/')) {
                // Surface invalid-password text if any.
                const err = await evaluateJson<
                    string | null
                >(
                    cdp,
                    `document.querySelector(
                        '#password-error:not(.hidden)'
                    )?.textContent?.trim() ?? null`,
                );
                if (err) {
                    throw new Error(
                        `Login failure: ${err}`,
                    );
                }
                return null;
            }
            return href;
        },
    );
    // Land wherever return target sent us; wait ready
    // so the session is fully established.
    await waitPageReady(
        cdp,
        'post-login page',
        LOGIN_TIMEOUT_MS,
    );
}

async function discoverDetailUrls(
    cdp: CdpClient,
    baseUrl: string,
    pageKeys: string[],
): Promise<Record<string, string>> {
    const needDetail = new Set<string>();
    for (const key of pageKeys) {
        if (DETAIL_FROM_LIST[key] !== undefined) {
            needDetail.add(key);
        }
        if (key === 'flow-stats') {
            needDetail.add('flow-detail');
        }
        if (key === 'idea-convert') {
            needDetail.add('idea-detail');
        }
        if (
            key === 'identity-providers'
            || key === 'identity-tokens'
        ) {
            needDetail.add('identity-detail');
        }
    }
    const discovered: Record<string, string> = {};
    for (const detailKey of [...needDetail].sort()) {
        const listKey = DETAIL_FROM_LIST[detailKey];
        if (listKey === undefined) {
            continue;
        }
        const listUrl = registryUrl(
            baseUrl, listKey,
        );
        await pageNavigate(cdp, listUrl);
        await waitPageReady(
            cdp,
            `list ${listKey}`,
            PAGE_READY_MS,
        );
        const href = await evaluateJson<
            string | null
        >(
            cdp,
            `document.querySelector(
                'a[href*="detail"]'
            )?.href ?? null`,
        );
        if (href === null || href.length === 0) {
            // Documented mock fallback for identity
            // only (Tony Stark id is "current").
            if (detailKey === 'identity-detail') {
                discovered[detailKey] = registryUrl(
                    baseUrl,
                    'identity-detail',
                    'identityId=current',
                );
                continue;
            }
            throw new Error(
                `Detail URL discovery failed on list`
                + ` page "${listKey}" for`
                + ` "${detailKey}": no`
                + ` a[href*="detail"] found`,
            );
        }
        discovered[detailKey] = href;
    }
    // Derived URLs from scraped query strings.
    if (
        pageKeys.includes('flow-stats')
        || pageKeys.includes('flow-detail')
    ) {
        const flowDetail = discovered['flow-detail'];
        if (flowDetail !== undefined) {
            discovered['flow-stats'] = registryUrl(
                baseUrl,
                'flow-stats',
                queryOf(flowDetail),
            );
        }
    }
    if (
        pageKeys.includes('idea-convert')
        || pageKeys.includes('idea-detail')
    ) {
        const ideaDetail = discovered['idea-detail'];
        if (ideaDetail !== undefined) {
            discovered['idea-convert'] = registryUrl(
                baseUrl,
                'idea-convert',
                queryOf(ideaDetail),
            );
        }
    }
    const identityDetail =
        discovered['identity-detail'];
    if (identityDetail !== undefined) {
        const q = queryOf(identityDetail)
            || 'identityId=current';
        if (pageKeys.includes(
            'identity-providers',
        )) {
            discovered['identity-providers'] =
                registryUrl(
                    baseUrl,
                    'identity-providers',
                    q,
                );
        }
        if (pageKeys.includes(
            'identity-tokens',
        )) {
            discovered['identity-tokens'] =
                registryUrl(
                    baseUrl,
                    'identity-tokens',
                    q,
                );
        }
    } else if (
        pageKeys.includes('identity-providers')
        || pageKeys.includes('identity-tokens')
    ) {
        const q = 'identityId=current';
        if (pageKeys.includes(
            'identity-providers',
        )) {
            discovered['identity-providers'] =
                registryUrl(
                    baseUrl,
                    'identity-providers',
                    q,
                );
        }
        if (pageKeys.includes(
            'identity-tokens',
        )) {
            discovered['identity-tokens'] =
                registryUrl(
                    baseUrl,
                    'identity-tokens',
                    q,
                );
        }
    }
    return discovered;
}

function resolvePageUrl(
    baseUrl: string,
    key: string,
    discovered: Record<string, string>,
): string {
    const d = discovered[key];
    if (d !== undefined) {
        return d;
    }
    return registryUrl(baseUrl, key);
}

// ── Sweep ──────

type PageRunWithHits = PageRun & {
    apiHits: ApiRequestHit[];
};

async function measurePage(
    cdp: CdpClient,
    key: string,
    url: string,
    runs: number,
): Promise<PageRunWithHits[]> {
    const out: PageRunWithHits[] = [];
    for (let i = 1; i <= runs; i++) {
        await pageNavigate(cdp, url);
        const run = await waitPageReady(
            cdp,
            `${key} (run ${i}/${runs})`,
            PAGE_READY_MS,
        );
        out.push({
            readyMs: run.readyMs,
            phases: { ...run.phases },
            apiHits: run.apiHits.slice(),
        });
    }
    return out;
}

// ── Main ──────

async function main(): Promise<void> {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.kind === 'help') {
        process.stdout.write(usageText());
        return;
    }
    if (parsed.kind === 'error') {
        process.stderr.write(
            `measure: ${parsed.message}\n\n`,
        );
        process.stderr.write(usageText());
        process.exitCode = 1;
        return;
    }
    const cli = parsed.cli;
    const repoRoot = process.cwd();

    const visualizeOnly =
        cli.visualize
        && !cli.check
        && !cli.record
        && !cli.writeBudgets
        && !cli.profile
        && cli.pages === null
        && !cli.runsExplicit;

    if (visualizeOnly) {
        const out = generateMeasureViz(repoRoot);
        process.stderr.write(
            `Wrote visualizer → ${out}\n`,
        );
        return;
    }

    // Clean tree: measure committed bytes only.
    {
        const { stdout } = await execFile(
            'git',
            ['status', '--porcelain'],
            { cwd: repoRoot },
        );
        if (stdout.trim().length > 0) {
            throw new Error(
                'Working tree is dirty; commit before'
                + ' measuring (every run measures'
                + ' committed bytes)',
            );
        }
    }

    const allKeys = Object.keys(PAGE_REGISTRY);
    let pageKeys: string[];
    if (cli.pages === null) {
        pageKeys = allKeys.slice().sort();
    } else {
        const unknown = cli.pages.filter(
            (k) => PAGE_REGISTRY[k] === undefined,
        );
        if (unknown.length > 0) {
            throw new Error(
                'Unknown --pages keys: '
                + unknown.join(', '),
            );
        }
        pageKeys = cli.pages.slice();
    }

    const chromePath = chromeBinary();
    if (!existsSync(chromePath)) {
        throw new Error(
            `Chrome not found at: ${chromePath}`
            + ' (set CHROME env to override)',
        );
    }

    const root = tmpRoot();
    const buildDir = mkdtempSync(
        join(root, 'fusion-measure.'),
    );
    const chromeDir = mkdtempSync(
        join(root, 'fusion-measure-chrome.'),
    );

    let serverProc: ChildProcess | null = null;
    let chromeProc: ChildProcess | null = null;
    let cdp: CdpClient | null = null;

    try {
        // 1. Build
        process.stderr.write(
            `Building to ${buildDir}/ …\n`,
        );
        try {
            await execFile(
                './build',
                ['--no-zip', buildDir + '/'],
                {
                    cwd: repoRoot,
                    maxBuffer: 16 * 1024 * 1024,
                },
            );
        } catch (err: unknown) {
            const e = err as {
                message?: string;
                stderr?: string | Buffer;
                stdout?: string | Buffer;
            };
            const stderr = e.stderr
                ? String(e.stderr).trim()
                : '';
            const stdout = e.stdout
                ? String(e.stdout).trim()
                : '';
            throw new Error(
                'Build failed'
                + (stderr ? `: ${stderr}` : '')
                + (stdout && !stderr
                    ? `: ${stdout}`
                    : '')
                + (!stderr && !stdout
                    ? `: ${e.message ?? err}`
                    : ''),
            );
        }

        // 2. Serve
        const port = await freePort();
        const baseUrl =
            `http://127.0.0.1:${port}`;
        serverProc = spawn(
            'python3',
            [
                '-m',
                'http.server',
                String(port),
                '--directory',
                buildDir,
            ],
            {
                stdio: 'ignore',
                detached: true,
            },
        );
        serverProc.unref();
        // Wait until the server accepts connections.
        await pollUntil(
            `http.server on port ${port}`,
            10_000,
            async () => {
                try {
                    const res = await fetch(
                        baseUrl + '/',
                    );
                    return res.ok || res.status === 404
                        ? true
                        : null;
                } catch {
                    return null;
                }
            },
        );

        // 3. Launch Chrome
        process.stderr.write(
            'Launching headless Chrome …\n',
        );
        chromeProc = spawn(
            chromePath,
            [
                '--headless=new',
                '--remote-debugging-port=0',
                `--user-data-dir=${chromeDir}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
                '--disable-gpu',
                'about:blank',
            ],
            {
                stdio: 'ignore',
                detached: true,
            },
        );
        chromeProc.unref();
        const debugPort = await waitDevtoolsPort(
            chromeDir,
            CHROME_READY_MS,
        );
        const wsUrl = await pageWsUrl(debugPort);
        cdp = await CdpClient.connect(wsUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        // 4. Seed
        process.stderr.write(
            'Seeding mock data …\n',
        );
        const password = await seedMockData(
            cdp, baseUrl,
        );

        // 5. Login
        process.stderr.write(
            `Logging in as ${DEMO_EMAIL} …\n`,
        );
        await login(cdp, baseUrl, password);

        // 6. Detail-URL discovery
        process.stderr.write(
            'Discovering detail URLs …\n',
        );
        const discovered = await discoverDetailUrls(
            cdp,
            baseUrl,
            pageKeys,
        );

        // 7. Sweep
        process.stderr.write(
            `Sweeping ${pageKeys.length} page(s)`
            + ` × ${cli.runs} run(s) …\n`,
        );
        const stats: Record<string, PageStats> = {};
        // Per-page readyMs samples (for --write-budgets).
        const readySamples: Record<string, number[]> = {};
        // First-run hits for --profile (seed is fixed).
        const profileHits: Record<
            string,
            {
                readyMs: number;
                phases: Record<string, number>;
                apiHits: ApiRequestHit[];
            }
        > = {};
        for (const key of pageKeys) {
            const url = resolvePageUrl(
                baseUrl, key, discovered,
            );
            process.stderr.write(
                `  ${key} ← ${url}\n`,
            );
            const runs = await measurePage(
                cdp, key, url, cli.runs,
            );
            stats[key] = statsForPage(runs);
            readySamples[key] = runs.map(
                (r) => r.readyMs,
            );
            if (cli.profile && runs[0] !== undefined) {
                const first = runs[0];
                profileHits[key] = {
                    readyMs: first.readyMs,
                    phases: { ...first.phases },
                    apiHits: first.apiHits.slice(),
                };
            }
        }

        // 8. Report
        const report = formatReport(stats);
        process.stdout.write(report + '\n');

        // 8a. --profile: API route counts + residual
        if (cli.profile) {
            for (const key of pageKeys) {
                const row = profileHits[key];
                if (row === undefined) continue;
                process.stdout.write(
                    formatRequestProfileReport(
                        key,
                        row.readyMs,
                        row.phases,
                        row.apiHits,
                    ),
                );
            }
        }

        // 8b. --write-budgets (mean + sigmas×sample σ)
        if (cli.writeBudgets) {
            const budgets: Budgets = {};
            for (const key of Object.keys(stats)
                .sort()
            ) {
                const samples = readySamples[key]!;
                budgets[key] = {
                    readyMs: budgetReadyMsFromSamples(
                        samples,
                        cli.budgetSigmas,
                    ),
                };
            }
            const budgetsFile = join(
                repoRoot, BUDGETS_PATH,
            );
            writeFileSync(
                budgetsFile,
                JSON.stringify(budgets, null, 4)
                    + '\n',
                'utf8',
            );
            process.stderr.write(
                `Wrote budgets → ${budgetsFile}`
                + ` (mean + ${cli.budgetSigmas}σ)\n`,
            );
        }

        // 9. --check
        if (cli.check) {
            const budgetsFile = join(
                repoRoot, BUDGETS_PATH,
            );
            if (!existsSync(budgetsFile)) {
                throw new Error(
                    `--check: budgets file missing: `
                    + budgetsFile,
                );
            }
            const budgets = JSON.parse(
                readFileSync(
                    budgetsFile, 'utf8',
                ),
            ) as Budgets;
            // Budget keys must name registry pages
            // (stale key drift). Unmeasured pages in a
            // --pages subset are NOT unknown-page.
            const registryKeys = new Set(
                Object.keys(PAGE_REGISTRY),
            );
            const staleBudgetKeys = Object.keys(
                budgets,
            ).filter((k) => !registryKeys.has(k));
            // Full sweep: both-ways against all budgets.
            // Subset: only gate measured pages (over /
            // missing-budget); subset is for iteration.
            const budgetsForCompare: Budgets =
                cli.pages === null
                    ? budgets
                    : Object.fromEntries(
                        Object.keys(stats)
                            .filter(
                                (k) =>
                                    budgets[k]
                                        !== undefined,
                            )
                            .map((k) => [
                                k,
                                budgets[k]!,
                            ]),
                    );
            const verdict = compareBudgets(
                stats, budgetsForCompare,
            );
            const offenders = [
                ...staleBudgetKeys.map((page) => ({
                    page,
                    reason: 'unknown-page' as const,
                    budgetReadyMs:
                        budgets[page]!.readyMs,
                })),
                ...(verdict.ok
                    ? []
                    : verdict.offenders),
            ];
            if (offenders.length > 0) {
                process.stderr.write(
                    'Budget check FAILED:\n',
                );
                for (const o of offenders) {
                    const bits = [
                        o.page,
                        o.reason,
                    ];
                    if (
                        o.medianReadyMs
                            !== undefined
                    ) {
                        bits.push(
                            `median=${o.medianReadyMs}`,
                        );
                    }
                    if (
                        o.budgetReadyMs
                            !== undefined
                    ) {
                        bits.push(
                            `budget=${o.budgetReadyMs}`,
                        );
                    }
                    process.stderr.write(
                        `  ${bits.join(' ')}\n`,
                    );
                }
                process.exitCode = 1;
                return;
            }
            process.stderr.write(
                'Budget check OK.\n',
            );
        }

        // 10. --record
        if (cli.record) {
            const { stdout: shaOut } =
                await execFile(
                    'git',
                    [
                        'rev-parse',
                        '--short=7',
                        'HEAD',
                    ],
                    { cwd: repoRoot },
                );
            const cpu = cpus();
            const line = shapeHistoryLine({
                at: new Date().toISOString(),
                sha: shaOut.trim(),
                machine: {
                    platform: platform(),
                    arch: arch(),
                    cpuModel:
                        cpu[0]?.model
                        ?? 'unknown',
                    cpuCount: cpu.length,
                },
                runs: cli.runs,
                stats,
            });
            const historyFile = join(
                repoRoot, HISTORY_PATH,
            );
            appendFileSync(
                historyFile,
                JSON.stringify(line) + '\n',
                'utf8',
            );
            process.stderr.write(
                `Recorded history → ${historyFile}\n`,
            );
        }

        // 11. --visualize (always from disk after run)
        if (cli.visualize) {
            if (!cli.record) {
                process.stderr.write(
                    'Note: this run is not in history; '
                    + 'visualizer regenerated from disk '
                    + 'only.\n',
                );
            }
            const out = generateMeasureViz(repoRoot);
            process.stderr.write(
                `Wrote visualizer → ${out}\n`,
            );
        }
    } finally {
        if (cdp !== null) {
            cdp.close();
        }
        killProcessTree(chromeProc);
        killProcessTree(serverProc);
        try {
            rmSync(buildDir, {
                recursive: true,
                force: true,
            });
        } catch {
            // best-effort
        }
        try {
            rmSync(chromeDir, {
                recursive: true,
                force: true,
            });
        } catch {
            // best-effort
        }
    }
}

main().catch((err: unknown) => {
    const msg = err instanceof Error
        ? err.message
        : String(err);
    process.stderr.write(`measure failed: ${msg}\n`);
    process.exitCode = 1;
});
