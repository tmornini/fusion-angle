import {
    getPreference,
} from './preferences-store';

const STORAGE_KEY_LOG_LEVEL =
    'fusion-ai:log-level';
const LEVELS = {
    debug: 0, info: 1,
    warn: 2, error: 3,
} as const;
type Level = keyof typeof LEVELS;

function getConfiguredLevel(): Level {
    const raw = getPreference(
        STORAGE_KEY_LOG_LEVEL,
    );
    if (raw && raw in LEVELS) {
        return raw as Level;
    }
    return 'warn';
}

function shouldLog(level: Level): boolean {
    return LEVELS[level] >= LEVELS[getConfiguredLevel()];
}

function formatPrefix(level: Level, context?: string): string {
    const tag = context ? `[fusion-ai:${context}]` : '[fusion-ai]';
    return `${tag} ${level.toUpperCase()}`;
}

export const log = {
    debug(
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (shouldLog('debug'))
            console.debug(
                formatPrefix('debug', context),
                message,
                ...data,
            );
    },
    info(
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (shouldLog('info'))
            console.info(
                formatPrefix('info', context),
                message,
                ...data,
            );
    },
    warn(
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (shouldLog('warn'))
            console.warn(
                formatPrefix('warn', context),
                message,
                ...data,
            );
    },
    error(
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (shouldLog('error'))
            console.error(
                formatPrefix('error', context),
                message,
                ...data,
            );
    },
};
