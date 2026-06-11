import {
    getPreference,
} from './adapters/preferences.ts';

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
    return (
        LEVELS[level]
        >= LEVELS[getConfiguredLevel()]
    );
}

function formatPrefix(
    level: Level,
    context?: string,
    requestId?: string,
): string {
    const tag = context
        ? `[fusion-ai:${context}]`
        : '[fusion-ai]';
    const reqTag = requestId
        ? ` [req:${requestId.slice(0, 8)}]`
        : '';
    return `${tag}${reqTag} ${
        level.toUpperCase()
    }`;
}

type LogMethod = (
    message: string,
    context?: string,
    ...data: unknown[]
) => void;

interface BoundLogger {
    debug: LogMethod;
    info: LogMethod;
    warn: LogMethod;
    error: LogMethod;
}

function makeLogMethod(
    level: Level,
    requestId?: string,
): LogMethod {
    return function (
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (!shouldLog(level)) return;
        const prefix = formatPrefix(
            level, context, requestId,
        );
        switch (level) {
            case 'debug':
                console.debug(
                    prefix, message, ...data,
                );
                break;
            case 'info':
                console.info(
                    prefix, message, ...data,
                );
                break;
            case 'warn':
                console.warn(
                    prefix, message, ...data,
                );
                break;
            case 'error':
                console.error(
                    prefix, message, ...data,
                );
                break;
        }
    };
}

function makeLogger(
    requestId?: string,
): BoundLogger {
    return {
        debug: makeLogMethod('debug', requestId),
        info: makeLogMethod('info', requestId),
        warn: makeLogMethod('warn', requestId),
        error: makeLogMethod(
            'error', requestId,
        ),
    };
}

export const log = {
    ...makeLogger(),
    with(requestId: string): BoundLogger {
        return makeLogger(requestId);
    },
};
