// Deno-only CDP page-load benchmark harness.
// Run via ./measure from the repo root (see that wrapper).
// Uses Deno APIs + global WebSocket; never runs in a browser.
//
// Flow: optional bare --visualize (disk only) → clean-tree
// gate → (build → ./postgres-seed → ./fusion-angle serve) or
// --base-url origin → Chrome → login → detail-URL
// discovery → N-run sweep → report → optional
// --check / --record / --visualize. Cleanup always in
// finally.

import { join } from '@std/path';

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
    type BudgetOffender,
} from './measure-core.ts';
import { generateMeasureViz } from './measure-viz.ts';
import {
    formatRequestProfileReport,
    type ApiRequestHit,
} from './measure-profile-core.ts';
import {
    DEFAULT_RUNS,
    DEFAULT_BUDGET_SIGMAS,
    MEASURE_DEMO_EMAIL,
    MEASURE_SEED_COMMAND,
    MEASURE_SERVER_ENTRY,
    isVisualizeOnly,
    lastJsonLogMessage,
    measureSeedArgs,
    measureServerArgs,
    needsLocalMeasureServer,
    parseMeasureArgv,
    passwordFromSeedReveal,
    readMeasureServeEnv,
    type MeasureEnv,
    type MeasureServeEnv,
} from './measure-cli.ts';
import {
    CHROME_READY_MS,
    CdpClient,
    type KillableChild,
    chromeBinary,
    evaluateJson,
    killProcessTree,
    launchChrome,
    pageNavigate,
    pageWsUrl,
    pollUntil,
    waitDevtoolsPort,
} from './cdp-client.ts';
import { login, registryUrl, waitPageReady } from './browser-drive.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

const SEED_TIMEOUT_MS = 120_000;
const PAGE_READY_MS = 120_000;
const STDERR_DRAIN_MS = 2_000;
const BUDGETS_PATH = 'measurements/budgets.json';
const HISTORY_PATH = 'measurements/history.jsonl';

// The history file's existing records define the machine
// vocabulary, and measure-viz renders arch straight from
// them, so the runtime's tongue stops at this adapter
// rather than letting a second word into one ledger.
// Keyed by Deno.build.arch, so a new architecture fails
// `deno check` instead of recording an unknown word.
const RECORDED_ARCH: Record<typeof Deno.build.arch, string> = {
    aarch64: 'arm64',
    x86_64: 'x64',
};

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

function usageText(): string {
    return [
        'Usage: ./measure [options]',
        '',
        'Page-load benchmark via headless Chrome + CDP.',
        'Stats drop the top and bottom 10% of samples',
        '(ceil(n×0.10) per tail; n=25 drops three each).',
        '',
        'Bare ./measure is the full ceremony: --record',
        '--write-budgets --runs 25 --visualize over the',
        'full PAGE_REGISTRY (clean tree required).',
        '',
        'Options:',
        '  --check              Fail if medians exceed',
        '                       budgets',
        '  --record             Append a history line',
        '                       under measurements/',
        '                       (full registry only;',
        '                       omit --pages)',
        '  --write-budgets      Write mean+kσ budgets',
        '                       (full registry only)',
        '  --budget-sigmas N    σ multiplier for',
        '                       --write-budgets',
        `                       (default ${DEFAULT_BUDGET_SIGMAS})`,
        '  --pages a,b,c        Subset of PAGE_REGISTRY',
        '                       keys (not with --record',
        '                       or --write-budgets)',
        '  --runs N             Runs per page',
        `                       (default ${DEFAULT_RUNS})`,
        '  --visualize          Write measurements/',
        '                       page-load-times-',
        '                       broken-in-ichat.html',
        '                       from disk history',
        '                       (alone = no Chrome;',
        '                       with a run,',
        '                       regenerate after)',
        '  --profile            For each measured page, print',
        '                       API request counts by route and',
        '                       page-init time not spent in',
        '                       fetch/render. If --pages is',
        '                       omitted, uses organization,',
        '                       workbox, workbox-detail,',
        '                       projects. If --runs is',
        '                       omitted, uses 1.',
        '  --base-url URL       Hit this origin instead',
        '                       of building and spawning',
        '                       ./fusion-angle serve.',
        '                       Skips the seed.',
        '  --password SECRET    Auth password when',
        '                       --base-url is set.',
        '                       MEASURE_PASSWORD also',
        '                       accepted.',
        '  --help, -h           Show this help',
        '',
        'Examples:',
        '  ./measure',
        '    (= --record --write-budgets --runs 25',
        '     --visualize; full registry)',
        '  ./measure --runs 5',
        '    (measure + report only; no history write)',
        '  ./measure --pages dashboard,ideas --runs 1',
        '    (subset smoke; no --record)',
        '  ./measure --check',
        '  ./measure --write-budgets --runs 30',
        '  ./measure --visualize',
        '  ./measure --profile',
        '  ./measure --profile --pages ideas,dashboard',
        '  ./measure --record --write-budgets',
        '    --base-url http://127.0.0.1:8080',
        '    --password "$MEASURE_PASSWORD"',
        '',
    ].join('\n');
}

// ── Small utils ──────

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

async function freePort(): Promise<number> {
    // Loopback, as the spawned server's URL will be.
    const listener = Deno.listen({
        hostname: '127.0.0.1',
        port: 0,
    });
    const { port } = listener.addr as Deno.NetAddr;
    listener.close();
    return port;
}

function queryOf(url: string): string {
    const i = url.indexOf('?');
    return i >= 0 ? url.slice(i + 1) : '';
}

// ── Login / discovery ──────

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
        const q = queryOf(identityDetail);
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
    // Deno.env.toObject() is forbidden under a scoped
    // --allow-env, so name every variable read here.
    const measureEnv: MeasureEnv = {
        MEASURE_PASSWORD: Deno.env.get('MEASURE_PASSWORD'),
        POSTGRES_URL: Deno.env.get('POSTGRES_URL'),
        JWT_HMAC_SIGNING_KEY: Deno.env.get(
            'JWT_HMAC_SIGNING_KEY',
        ),
    };
    const parsed = parseMeasureArgv(
        Deno.args,
        measureEnv,
    );
    if (parsed.kind === 'help') {
        Deno.stdout.writeSync(enc.encode(usageText()));
        return;
    }
    if (parsed.kind === 'error') {
        Deno.stderr.writeSync(enc.encode(
            `measure: ${parsed.message}\n\n`,
        ));
        Deno.stderr.writeSync(enc.encode(usageText()));
        Deno.exitCode = 1;
        return;
    }
    const cli = parsed.cli;
    const repoRoot = Deno.cwd();

    if (isVisualizeOnly(cli)) {
        const out = generateMeasureViz(repoRoot);
        Deno.stderr.writeSync(enc.encode(
            `Wrote visualizer → ${out}\n`,
        ));
        return;
    }

    // Clean tree: measure committed bytes only.
    {
        // Deno.Command resolves a non-zero exit rather
        // than rejecting the way execFile did, so every
        // child below is checked for success by hand.
        const status = await new Deno.Command('git', {
            args: ['status', '--porcelain'],
            cwd: repoRoot,
            stdout: 'piped',
            stderr: 'piped',
        }).output();
        if (!status.success) {
            throw new Error(
                'git status failed: '
                + dec.decode(status.stderr).trim(),
            );
        }
        const stdout = dec.decode(status.stdout);
        if (stdout.trim().length > 0) {
            throw new Error(
                'Working tree is dirty; commit before'
                + ' measuring (every run measures'
                + ' committed bytes)',
            );
        }
    }

    let localServe: MeasureServeEnv | null = null;
    if (needsLocalMeasureServer(cli)) {
        const serveEnv = readMeasureServeEnv(
            measureEnv,
        );
        if (serveEnv.kind === 'error') {
            throw new Error(serveEnv.message);
        }
        localServe = serveEnv.env;
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
    if (!exists(chromePath)) {
        throw new Error(
            `Chrome not found at: ${chromePath}`
            + ' (set CHROME env to override)',
        );
    }

    // makeTempDirSync honours TMPDIR itself, so the
    // fallback chain the Node harness carried is gone.
    const useOrigin = cli.baseUrl !== null;
    const buildDir = useOrigin
        ? null
        : Deno.makeTempDirSync({
            prefix: 'fusion-measure.',
        });
    const chromeDir = Deno.makeTempDirSync({
        prefix: 'fusion-measure-chrome.',
    });

    let serverProc: Deno.ChildProcess | null = null;
    let chromeProc: KillableChild | null = null;
    let cdp: CdpClient | null = null;

    try {
        let baseUrl: string;
        let password: string;
        if (cli.baseUrl !== null) {
            if (cli.password === null) {
                throw new Error(
                    '--base-url requires --password'
                    + ' or MEASURE_PASSWORD',
                );
            }
            password = cli.password;
            baseUrl = cli.baseUrl;
            Deno.stderr.writeSync(enc.encode(
                `Using origin ${baseUrl} …\n`,
            ));
            await pollUntil(
                `origin ${baseUrl}`,
                10_000,
                async () => {
                    try {
                        const res = await fetch(
                            baseUrl + '/',
                        );
                        return res.ok
                            || res.status === 404
                            ? true
                            : null;
                    } catch {
                        return null;
                    }
                },
            );
        } else {
            // 1. Build
            Deno.stderr.writeSync(enc.encode(
                `Building to ${buildDir}/ …\n`,
            ));
            const built = await new Deno.Command(
                './build',
                {
                    args: ['--no-zip', buildDir + '/'],
                    cwd: repoRoot,
                    stdout: 'piped',
                    stderr: 'piped',
                },
            ).output();
            if (!built.success) {
                const stderr = dec
                    .decode(built.stderr).trim();
                const stdout = dec
                    .decode(built.stdout).trim();
                throw new Error(
                    'Build failed'
                    + (stderr ? `: ${stderr}` : '')
                    + (stdout && !stderr
                        ? `: ${stdout}`
                        : '')
                    + (!stderr && !stdout
                        ? `: exit ${built.code}`
                        : ''),
                );
            }

            // 2. Seed via ./postgres-seed, then spawn
            //    ./fusion-angle serve
            if (localServe === null) {
                throw new Error(
                    'missing required env POSTGRES_URL',
                );
            }
            Deno.stderr.writeSync(enc.encode('Seeding Postgres …\n'));
            const seeded = await new Deno.Command(
                MEASURE_SEED_COMMAND,
                {
                    args: measureSeedArgs(),
                    cwd: repoRoot,
                    // Deno.CommandOptions has no
                    // `timeout`; the abort signal is the
                    // bound, and it SIGTERMs the child
                    // instead of rejecting — so a hung
                    // seed surfaces below as !success.
                    signal: AbortSignal.timeout(
                        SEED_TIMEOUT_MS,
                    ),
                    // Named overlay, not a spread:
                    // clearEnv defaults to false, so the
                    // child still inherits PATH and the
                    // operator's PG* tuning, and no
                    // Deno.env.toObject() is needed.
                    env: {
                        POSTGRES_URL:
                            localServe.postgresUrl,
                        JWT_HMAC_SIGNING_KEY:
                            localServe.jwtHmacSigningKey,
                    },
                    stdout: 'piped',
                    stderr: 'piped',
                },
            ).output();
            const seedOut = dec.decode(seeded.stdout);
            const seedErr = dec.decode(seeded.stderr);
            if (!seeded.success) {
                const logged = lastJsonLogMessage(
                    seedErr,
                );
                throw new Error(
                    logged
                    ?? (seedErr.trim()
                        || 'seed failed: '
                            + (seeded.signal === null
                                ? `exit ${seeded.code}`
                                : 'signal '
                                    + seeded.signal)),
                );
            }
            const parsed = passwordFromSeedReveal(
                seedOut,
                MEASURE_DEMO_EMAIL,
            );
            if (parsed === null) {
                throw new Error(
                    'seed reveal missing password for '
                    + MEASURE_DEMO_EMAIL,
                );
            }
            password = parsed;

            const port = await freePort();
            baseUrl = `http://127.0.0.1:${port}`;
            Deno.stderr.writeSync(enc.encode(
                `Starting ${MEASURE_SERVER_ENTRY} serve on ${baseUrl}`
                + ' …\n',
            ));
            const server = new Deno.Command(
                MEASURE_SERVER_ENTRY,
                {
                    args: measureServerArgs(),
                    // Non-null on this branch: buildDir
                    // is made whenever --base-url is not.
                    cwd: buildDir!,
                    // Named overlay, not a spread; see
                    // the seed above.
                    env: {
                        POSTGRES_URL:
                            localServe.postgresUrl,
                        JWT_HMAC_SIGNING_KEY:
                            localServe.jwtHmacSigningKey,
                        HTTP_SERVER_PORT: String(port),
                    },
                    stdin: 'null',
                    stdout: 'null',
                    stderr: 'piped',
                    detached: true,
                },
            ).spawn();
            serverProc = server;
            server.unref();
            // A piped stderr MUST be read: the poll below
            // reports the server's last JSON log line
            // when it dies during boot, and an undrained
            // pipe would lose that line and stall the
            // child once the buffer filled.
            let stderrText = '';
            const stderrDrained = (async () => {
                // TextDecoderStream owns the partial-
                // sequence state a chunked decode needs,
                // so the shared decoder never carries it
                // into an unrelated one.
                const text = server.stderr.pipeThrough(
                    new TextDecoderStream(),
                );
                for await (const chunk of text) {
                    stderrText += chunk;
                }
            })();
            // Deno.ChildProcess has no synchronous exit
            // code, so record the status when it settles.
            let exited: Deno.CommandStatus | null = null;
            server.status.then((status) => {
                exited = status;
            });
            await pollUntil(
                `${MEASURE_SERVER_ENTRY} serve on port ${port}`,
                SEED_TIMEOUT_MS,
                async () => {
                    if (exited !== null) {
                        // The child is gone, so the
                        // drain should finish at once; a
                        // grandchild that inherited fd 2
                        // holds the pipe open and EOF
                        // never comes, so bound the wait
                        // and report what has arrived.
                        let drainTimer:
                            | ReturnType<typeof setTimeout>
                            | undefined;
                        await Promise.race([
                            stderrDrained,
                            new Promise<void>((done) => {
                                drainTimer = setTimeout(
                                    done,
                                    STDERR_DRAIN_MS,
                                );
                            }),
                        ]);
                        clearTimeout(drainTimer);
                        const boot = lastJsonLogMessage(
                            stderrText,
                        );
                        throw new Error(
                            `${MEASURE_SERVER_ENTRY} serve exited`
                            + (boot
                                ? `: ${boot}`
                                : ''),
                        );
                    }
                    try {
                        const res = await fetch(
                            baseUrl + '/',
                        );
                        return res.ok
                            || res.status === 404
                            ? true
                            : null;
                    } catch {
                        return null;
                    }
                },
            );
        }

        // 3. Launch Chrome
        Deno.stderr.writeSync(enc.encode(
            'Launching headless Chrome …\n',
        ));
        chromeProc = launchChrome({ userDataDir: chromeDir });
        const debugPort = await waitDevtoolsPort(
            chromeDir,
            CHROME_READY_MS,
        );
        const wsUrl = await pageWsUrl(debugPort);
        cdp = await CdpClient.connect(wsUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');

        // 4. Login (seed is ./postgres-seed --mock-data,
        // or --password against --base-url).
        Deno.stderr.writeSync(enc.encode(
            `Logging in as ${MEASURE_DEMO_EMAIL} …\n`,
        ));
        await login(cdp, baseUrl, MEASURE_DEMO_EMAIL, password);

        // 5. Detail-URL discovery
        Deno.stderr.writeSync(enc.encode(
            'Discovering detail URLs …\n',
        ));
        const discovered = await discoverDetailUrls(
            cdp,
            baseUrl,
            pageKeys,
        );

        // 7. Sweep
        Deno.stderr.writeSync(enc.encode(
            `Sweeping ${pageKeys.length} page(s)`
            + ` × ${cli.runs} run(s) …\n`,
        ));
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
            Deno.stderr.writeSync(enc.encode(
                `  ${key} ← ${url}\n`,
            ));
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
        Deno.stdout.writeSync(enc.encode(report + '\n'));

        // 8a. --profile: API route counts + residual
        if (cli.profile) {
            for (const key of pageKeys) {
                const row = profileHits[key];
                if (row === undefined) continue;
                Deno.stdout.writeSync(enc.encode(
                    formatRequestProfileReport(
                        key,
                        row.readyMs,
                        row.phases,
                        row.apiHits,
                    ),
                ));
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
            Deno.writeTextFileSync(
                budgetsFile,
                JSON.stringify(budgets, null, 4)
                    + '\n',
            );
            Deno.stderr.writeSync(enc.encode(
                `Wrote budgets → ${budgetsFile}`
                + ` (mean + ${cli.budgetSigmas}σ)\n`,
            ));
        }

        // 9. --check
        if (cli.check) {
            const budgetsFile = join(
                repoRoot, BUDGETS_PATH,
            );
            if (!exists(budgetsFile)) {
                throw new Error(
                    `--check: budgets file missing: `
                    + budgetsFile,
                );
            }
            const budgets = JSON.parse(
                Deno.readTextFileSync(budgetsFile),
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
            const staleOffenders: BudgetOffender[] =
                staleBudgetKeys.map((page) => ({
                    page,
                    reason: 'unknown-page',
                    budgetReadyMs:
                        budgets[page]!.readyMs,
                }));
            const offenders: BudgetOffender[] = [
                ...staleOffenders,
                ...(verdict.ok
                    ? []
                    : verdict.offenders),
            ];
            if (offenders.length > 0) {
                Deno.stderr.writeSync(enc.encode(
                    'Budget check FAILED:\n',
                ));
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
                    Deno.stderr.writeSync(enc.encode(
                        `  ${bits.join(' ')}\n`,
                    ));
                }
                Deno.exitCode = 1;
                return;
            }
            Deno.stderr.writeSync(enc.encode(
                'Budget check OK.\n',
            ));
        }

        // 10. --record
        if (cli.record) {
            const sha = await new Deno.Command('git', {
                args: [
                    'rev-parse',
                    '--short=7',
                    'HEAD',
                ],
                cwd: repoRoot,
                stdout: 'piped',
                stderr: 'piped',
            }).output();
            if (!sha.success) {
                throw new Error(
                    'git rev-parse failed: '
                    + dec.decode(sha.stderr).trim(),
                );
            }
            const line = shapeHistoryLine({
                at: new Date().toISOString(),
                sha: dec.decode(sha.stdout).trim(),
                machine: {
                    // Deno.build.os already speaks the
                    // recorded vocabulary ('darwin').
                    platform: Deno.build.os,
                    arch: RECORDED_ARCH[Deno.build.arch],
                    // Deno exposes a core count but no
                    // CPU model, so records from here on
                    // carry the absence marker this
                    // field already fell back to.
                    cpuModel: 'unknown',
                    cpuCount:
                        navigator.hardwareConcurrency,
                },
                runs: cli.runs,
                stats,
            });
            const historyFile = join(
                repoRoot, HISTORY_PATH,
            );
            Deno.writeTextFileSync(
                historyFile,
                JSON.stringify(line) + '\n',
                { append: true },
            );
            Deno.stderr.writeSync(enc.encode(
                `Recorded history → ${historyFile}\n`,
            ));
        }

        // 11. --visualize (always from disk after run)
        if (cli.visualize) {
            if (!cli.record) {
                Deno.stderr.writeSync(enc.encode(
                    'Note: this run is not in history; '
                    + 'visualizer regenerated from disk '
                    + 'only.\n',
                ));
            }
            const out = generateMeasureViz(repoRoot);
            Deno.stderr.writeSync(enc.encode(
                `Wrote visualizer → ${out}\n`,
            ));
        }
    } finally {
        if (cdp !== null) {
            cdp.close();
        }
        killProcessTree(chromeProc);
        killProcessTree(serverProc);
        if (buildDir !== null) {
            try {
                Deno.removeSync(buildDir, {
                    recursive: true,
                });
            } catch {
                // best-effort
            }
        }
        try {
            Deno.removeSync(chromeDir, {
                recursive: true,
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
    Deno.stderr.writeSync(enc.encode(`measure failed: ${msg}\n`));
    Deno.exitCode = 1;
});
