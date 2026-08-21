// Pure CLI defaults and gates for ./measure.
// Consumed by measure.ts (Node harness) and unit tests.

import { DEFAULT_PROFILE_PAGES } from
    './measure-profile-core.ts';

export const DEFAULT_RUNS = 25;
export const DEFAULT_BUDGET_SIGMAS = 1.5;
export const MEASURE_DEMO_EMAIL = 'demo@example.com';
export const MEASURE_SERVER_ENTRY = 'server.mjs';
export const MEASURE_SEED_COMMAND = './postgres-seed';

export type MeasureServeEnv = {
    postgresUrl: string;
    jwtHmacSigningKey: string;
};

export function measureSeedArgs(): string[] {
    return ['--postgres', 'local', '--mock-data'];
}

export function measureServerArgs(): string[] {
    return [MEASURE_SERVER_ENTRY];
}

export function isVisualizeOnly(
    f: MeasureCliFlags,
): boolean {
    return f.visualize
        && !f.check
        && !f.record
        && !f.writeBudgets
        && !f.profile
        && f.pages === null
        && !f.runsExplicit
        && f.baseUrl === null;
}

export function needsLocalMeasureServer(
    f: MeasureCliFlags,
): boolean {
    return !isVisualizeOnly(f) && f.baseUrl === null;
}

export function readMeasureServeEnv(
    env: MeasureEnv,
): { kind: 'ok'; env: MeasureServeEnv }
    | { kind: 'error'; message: string } {
    const postgresUrl = env.POSTGRES_URL;
    if (postgresUrl === undefined || postgresUrl === '') {
        return {
            kind: 'error',
            message: 'missing required env POSTGRES_URL',
        };
    }
    const jwtHmacSigningKey = env.JWT_HMAC_SIGNING_KEY;
    if (
        jwtHmacSigningKey === undefined
        || jwtHmacSigningKey === ''
    ) {
        return {
            kind: 'error',
            message:
                'missing required env'
                + ' JWT_HMAC_SIGNING_KEY',
        };
    }
    return {
        kind: 'ok',
        env: { postgresUrl, jwtHmacSigningKey },
    };
}

export function passwordFromSeedReveal(
    text: string,
    username: string,
): string | null {
    const prefix = username + '\t';
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (!line.startsWith(prefix)) continue;
        const secret = line.slice(prefix.length);
        if (secret.length === 0) return null;
        return secret;
    }
    return null;
}

export function lastJsonLogMessage(
    text: string,
): string | null {
    let found: string | null = null;
    for (const raw of text.split('\n')) {
        const line = raw.replace(/\r$/, '').trim();
        if (!line.startsWith('{')) continue;
        try {
            const parsed = JSON.parse(line) as {
                message?: unknown;
            };
            if (
                typeof parsed.message === 'string'
                && parsed.message.length > 0
            ) {
                found = parsed.message;
            }
        } catch {
            // ignore non-JSON
        }
    }
    return found;
}

export type MeasureCliFlags = {
    check: boolean;
    record: boolean;
    writeBudgets: boolean;
    visualize: boolean;
    profile: boolean;
    pages: string[] | null;
    runs: number;
    runsExplicit: boolean;
    baseUrl: string | null;
    password: string | null;
};

export type MeasureCli = MeasureCliFlags & {
    budgetSigmas: number;
};

export type MeasureEnv = {
    MEASURE_PASSWORD?: string;
    POSTGRES_URL?: string;
    JWT_HMAC_SIGNING_KEY?: string;
};

export type ParseMeasureResult =
    | { kind: 'ok'; cli: MeasureCli }
    | { kind: 'help' }
    | { kind: 'error'; message: string };

export function finalizeMeasureCli(
    f: MeasureCliFlags,
): { kind: 'ok'; cli: MeasureCliFlags }
    | { kind: 'error'; message: string } {
    // Partial record illegal (full registry only).
    if (f.record && f.pages !== null) {
        return {
            kind: 'error',
            message:
                '--record requires a full registry'
                + ' sweep (omit --pages)',
        };
    }
    // write-budgets also requires full registry.
    if (f.writeBudgets && f.pages !== null) {
        return {
            kind: 'error',
            message:
                '--write-budgets requires a full'
                + ' registry sweep (omit --pages)',
        };
    }
    // Bare → full ceremony: record + write-budgets
    // + visualize + DEFAULT_RUNS.
    const bare =
        !f.check
        && !f.record
        && !f.writeBudgets
        && !f.visualize
        && !f.profile
        && f.pages === null
        && !f.runsExplicit
        && f.baseUrl === null;
    if (bare) {
        return {
            kind: 'ok',
            cli: {
                ...f,
                record: true,
                writeBudgets: true,
                visualize: true,
                runs: DEFAULT_RUNS,
            },
        };
    }
    return { kind: 'ok', cli: f };
}

function stripTrailingSlashes(url: string): string {
    let out = url;
    while (out.endsWith('/')) {
        out = out.slice(0, -1);
    }
    return out;
}

export function parseMeasureArgv(
    argv: readonly string[],
    env: MeasureEnv = {},
): ParseMeasureResult {
    let check = false;
    let record = false;
    let writeBudgets = false;
    let budgetSigmas = DEFAULT_BUDGET_SIGMAS;
    let pages: string[] | null = null;
    let runs = DEFAULT_RUNS;
    let visualize = false;
    let profile = false;
    let runsExplicit = false;
    let baseUrl: string | null = null;
    let password: string | null = null;
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
        if (a === '--base-url') {
            const v = argv[++i];
            if (v === undefined || v.length === 0) {
                return {
                    kind: 'error',
                    message: '--base-url requires a URL',
                };
            }
            const trimmed = stripTrailingSlashes(v);
            if (trimmed.length === 0) {
                return {
                    kind: 'error',
                    message: '--base-url requires a URL',
                };
            }
            baseUrl = trimmed;
            continue;
        }
        if (a === '--password') {
            const v = argv[++i];
            if (v === undefined || v.length === 0) {
                return {
                    kind: 'error',
                    message:
                        '--password requires a value',
                };
            }
            password = v;
            continue;
        }
        return {
            kind: 'error',
            message: `Unknown flag: ${a}`,
        };
    }
    if (password === null) {
        const fromEnv = env.MEASURE_PASSWORD;
        if (
            fromEnv !== undefined
            && fromEnv.length > 0
        ) {
            password = fromEnv;
        }
    }
    if (baseUrl !== null && password === null) {
        return {
            kind: 'error',
            message:
                '--base-url requires --password or'
                + ' MEASURE_PASSWORD',
        };
    }
    // Profile defaults before finalize so --profile is
    // never treated as bare ceremony. Heaviest page-init
    // pages, one run (counts deterministic for a seed).
    if (profile && pages === null) {
        pages = [...DEFAULT_PROFILE_PAGES];
    }
    if (profile && !runsExplicit) {
        runs = 1;
    }
    const finalized = finalizeMeasureCli({
        check,
        record,
        writeBudgets,
        visualize,
        profile,
        pages,
        runs,
        runsExplicit,
        baseUrl,
        password,
    });
    if (finalized.kind === 'error') {
        return finalized;
    }
    return {
        kind: 'ok',
        cli: {
            ...finalized.cli,
            budgetSigmas,
        },
    };
}
