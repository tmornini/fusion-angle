import {
    getPreference,
} from './adapters/preferences.ts';
import { STORAGE_KEY_LOG_LEVEL } from './storage-keys.ts';

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

// RFC-3339 zulu at emission. Independent of api/types
// nowUtc — that mint advances the message-plane total
// order and must not be touched by UI logging.
function logTimestamp(): string {
    return new Date().toISOString();
}

// A plain object of structured fields (not Error, not
// array). Merged into the log record so call sites can
// pass { page, delayMs, ... } without concatenating
// values into the message (Office of Structured
// Observability).
function isPlainFields(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && !(value instanceof Error)
    );
}

function buildFields(
    level: Level,
    context: string | undefined,
    operationId: string | undefined,
    extra: Record<string, unknown> | undefined,
): Record<string, unknown> {
    // Extras first; envelope keys win so a
    // caller cannot overwrite ts/level/
    // context/operationId via the fields bag.
    const fields: Record<string, unknown> = {
        ...(extra ?? {}),
        ts: logTimestamp(),
        level,
    };
    if (context !== undefined) {
        fields.context = context;
    } else {
        delete fields['context'];
    }
    if (operationId !== undefined) {
        fields.operationId = operationId;
    } else {
        delete fields['operationId'];
    }
    return fields;
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
    operationId?: string,
): LogMethod {
    return function (
        message: string,
        context?: string,
        ...data: unknown[]
    ): void {
        if (!shouldLog(level)) return;
        let extra: Record<string, unknown> | undefined;
        let rest = data;
        if (isPlainFields(data[0])) {
            extra = data[0];
            rest = data.slice(1);
        }
        const fields = buildFields(
            level, context, operationId, extra,
        );
        switch (level) {
            case 'debug':
                console.debug(
                    message, fields, ...rest,
                );
                break;
            case 'info':
                console.info(
                    message, fields, ...rest,
                );
                break;
            case 'warn':
                console.warn(
                    message, fields, ...rest,
                );
                break;
            case 'error':
                console.error(
                    message, fields, ...rest,
                );
                break;
        }
    };
}

function makeLogger(
    operationId?: string,
): BoundLogger {
    return {
        debug: makeLogMethod('debug', operationId),
        info: makeLogMethod('info', operationId),
        warn: makeLogMethod('warn', operationId),
        error: makeLogMethod(
            'error', operationId,
        ),
    };
}

export const log = {
    ...makeLogger(),
    with(operationId: string): BoundLogger {
        return makeLogger(operationId);
    },
};
