import { html, type SafeHtml } from '../safe-html.ts';

// The state badge every detail/list presenter renders: a fixed-
// width pill carrying the state value, its icon, and label,
// dimmed when its group is not the active filter. The per-entity
// STATE config and icon are injected, so each presenter keeps
// its own config private — the process is shared, the
// participants vary.
export function stateBadge(
    state: string,
    config: { className: string; label: string },
    icon: (size: number, className: string) => SafeHtml,
    isActive: boolean | null,
): SafeHtml {
    const dimmed = isActive === false ? 'true' : 'false';
    return html`<span class="${
        'badge '
        + config.className
        + ' text-xs badge-fixed-w'
        + ' cursor-pointer'
    }" data-state="${state}" data-dimmed="${
        dimmed
    }">${icon(14, '')} ${config.label}</span>`;
}
