import { log } from './logger.ts';
import { showToast } from './toast.ts';
import type {
    RequestContext,
} from '../../client/request-context.ts';

// The human-readable message of a thrown value: an Error's
// `message`, else the optional `fallback`, else String(value).
// The lone home of the `instanceof Error` extraction the web-app
// layer repeats. A sibling copy lives in api/ so neither imports
// across the boundary — the api tier stays standalone.
export function extractErrorMessage(
    err: unknown,
    fallback?: string,
): string {
    if (err instanceof Error) return err.message;
    return fallback ?? String(err);
}

// Navigation abort is teardown, not a fault. Name,
// not message: "Failed to fetch" is a live TypeError
// until pagehide latches.
export function isAbortFault(err: unknown): boolean {
    return typeof err === 'object'
        && err !== null
        && 'name' in err
        && err.name === 'AbortError';
}

export function shouldSurfaceFault(
    err: unknown,
    pageUnloading: boolean,
): boolean {
    if (pageUnloading) return false;
    return !isAbortFault(err);
}

// One latch for the floor and for caught reportFault.
// Production boots once; tests pageshow in finally.
let pageUnloading = false;

// One voice for a failed gesture: log the fault bound to the
// operation, then toast the gesture's name with the fault's
// message. `message` names the WHOLE gesture ('Failed to
// save member'), never just the first call inside it.
export function reportFault(
    ctx: RequestContext,
    message: string,
    err: unknown,
): void {
    if (!shouldSurfaceFault(err, pageUnloading)) {
        return;
    }
    log.with(ctx.operationId)
        .error(message, undefined, err);
    showToast(
        `${message}: ${extractErrorMessage(err)}`,
        'error',
    );
}

// The surfacing floor under every fault no caller handles:
// uncaught errors and unhandled rejections log AND toast, so a
// failed fire-and-forget handler degrades visibly instead of
// vanishing to the console while the UI proceeds. Aborted
// fetches and pagehide teardown do not toast.
export function initErrorSurfacing(): void {
    window.addEventListener('pagehide', () => {
        pageUnloading = true;
    });
    window.addEventListener('pageshow', () => {
        pageUnloading = false;
    });
    window.addEventListener('error', (event) => {
        const fault = event.error ?? event.message;
        if (!shouldSurfaceFault(fault, pageUnloading)) {
            return;
        }
        log.error('uncaught error', 'core', fault);
        showToast(extractErrorMessage(fault), 'error');
    });
    window.addEventListener(
        'unhandledrejection',
        (event) => {
            if (!shouldSurfaceFault(
                event.reason, pageUnloading,
            )) {
                return;
            }
            log.error(
                'unhandled rejection', 'core',
                event.reason,
            );
            showToast(
                extractErrorMessage(event.reason),
                'error',
            );
        },
    );
}
