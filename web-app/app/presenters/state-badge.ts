import { html, type SafeHtml } from '../safe-html.ts';

// The state filter chip every list presenter renders: a fixed-
// width toggle button carrying the state value, its icon, and
// label, dimmed when its group is not the active filter. The
// per-entity STATE config and icon are injected, so each
// presenter keeps its own config private — the process is
// shared, the participants vary.
export function stateBadge(
    state: string,
    config: { className: string; label: string },
    icon: (size: number, className: string) => SafeHtml,
    isActive: boolean | null,
): SafeHtml {
    const dimmed = isActive === false ? 'true' : 'false';
    const pressed = isActive === true ? 'true' : 'false';
    return html`<button type="button" class="${
        'badge '
        + config.className
        + ' text-xs badge-fixed-w'
        + ' cursor-pointer'
    }" data-state="${state}" data-dimmed="${
        dimmed
    }" aria-pressed="${
        pressed
    }">${icon(14, '')} ${config.label}</button>`;
}
