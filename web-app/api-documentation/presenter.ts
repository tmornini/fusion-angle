import { html, type SafeHtml } from
    '../app/safe-html.ts';
import type {
    ApiDocRoom,
    ApiDocStatus,
} from './rooms.ts';

export function roomHtml(room: ApiDocRoom): SafeHtml {
    return html`
        <h1 class="font-mono text-xl">${
            room.verb + ' ' + room.uri
        }</h1>
        <h2 class="mt-4 text-sm font-semibold">
            Request body</h2>
        <pre class="api-doc-pre">${room.body}</pre>
        <h2 class="mt-4 text-sm font-semibold">
            Headers</h2>
        <ul class="api-doc-list">
            ${room.headers.map((header) => html`
                <li>${header}</li>
            `)}
        </ul>
        <h2 class="mt-4 text-sm font-semibold">
            Status</h2>
        <ul class="api-doc-list">
            ${room.statuses.map((code) => html`
                <li><a href="${
                    '#statuses/' + code
                }">${code}</a></li>
            `)}
        </ul>
    `;
}

export function statusHtml(
    status: ApiDocStatus,
): SafeHtml {
    return html`
        <h1 class="font-mono text-xl">${
            status.code
        }</h1>
        <pre class="api-doc-pre">${status.body}</pre>
    `;
}

export function unknownHtml(hash: string): SafeHtml {
    return html`
        <h1>Not a room</h1>
        <p class="text-muted mt-2">
            No documentation room is named
            ${' ' + hash}.</p>
    `;
}
