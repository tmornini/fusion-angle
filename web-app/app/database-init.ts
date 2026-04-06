import { log } from './logger';
import {
    html, setHtml,
} from './safe-html';
import {
    errorMessage,
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
>${errorMessage(
    err, 'Unknown database error',
)}</pre>
      <p>Try clearing site data
        and reloading.</p>
    </div>`);
}
