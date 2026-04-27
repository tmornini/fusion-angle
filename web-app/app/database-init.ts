import { log } from './logger';
import {
    html, mutateHtml,
} from './safe-html';
import {
    formatErrorMessage,
} from './loading-states';

export async function initDatabase(
): Promise<boolean> {
    const { createLocalStorageAdapter } =
        await import(
            '../../api/db-localstorage'
        );
    const { initApi, GET } =
        await import('../../api/api');
    const adapter =
        await createLocalStorageAdapter();
    await adapter.initialize();
    initApi(adapter);
    const schema =
        await GET<string | null>(
            'snapshots/schema',
        );
    return schema !== null;
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
    mutateHtml(document.body, html`<div
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
>${formatErrorMessage(
    err, 'Unknown database error',
)}</pre>
      <p>Try clearing site data
        and reloading.</p>
    </div>`);
}
