import { log } from './logger.ts';
import {
    html, setHtml,
} from './safe-html.ts';
import {
    extractErrorMessage,
} from './error-helpers.ts';
import {
    defaultAdapter,
    initAdapter,
} from './adapters/init.ts';

export async function initDatabase(
): Promise<boolean> {
    return initAdapter(defaultAdapter);
}

// Inline styles here are intentional: this error is shown
// when the database fails to initialize, which may indicate
// a deeper bootstrap problem. We can't trust any class-based
// styling to render, so the error UI uses raw CSS values that
// don't depend on tokens or component classes loading correctly.
export function handleDatabaseError(
    err: unknown,
): void {
    log.error(
        'Database initialization'
        + ' failed:',
        'core',
        err,
    );
    setHtml(document.body, html`<div
        style="padding:2rem;
            font-family:sans-serif;
            max-width:40rem">
        <h1 style="color:hsl(0 72% 51%)">
            Failed to initialize database
        </h1>
        <pre style="background:hsl(0 100% 97%);
            padding:1rem;
            border-radius:0.5rem;
            overflow:auto;
            white-space:pre-wrap"
>${extractErrorMessage(
    err, 'Unknown database error',
)}</pre>
      <p>Try clearing site data
        and reloading.</p>
    </div>`);
}
