import { html, type SafeHtml } from '../safe-html.ts';

// The muted empty-state note a list presenter renders when it
// has no rows. The message is the participant; the note is the
// process — one builder, never copied beside itself.
export function mutedEmptyNote(message: string): SafeHtml {
    return html`<div class="${
        'p-4 text-sm text-muted text-center'
    }">${message}</div>`;
}
