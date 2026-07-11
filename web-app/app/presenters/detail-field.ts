import { html, type SafeHtml } from '../safe-html.ts';
import { displayText } from '../format.ts';

// Shared readonly label/value field for entity detail
// cards. Identity, human-member, and AI-member presenters
// rendered the same markup — promote at the third
// instance (Commandment IX). Free function, never a base
// class.
export function buildReadonlyField(
    label: string,
    value: string,
    icon?: SafeHtml,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }">${icon ?? html``} ${label}</p>
            <p class="text-sm">
                ${displayText(value)}
            </p>
        </div>`;
}
