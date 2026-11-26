import {
    PAGE_REGISTRY,
    NAV_GROUPS,
    type NavGroup,
    type PageEntry,
} from './page-registry.ts';
import { ICON_SIZE } from './icons.ts';

function navLinkHtml(key: string, entry: PageEntry): string {
    const href =
        `../${entry.sourceDir}/${entry.sourceFile}.html`;
    const icon = entry.icon
        ? entry.icon(ICON_SIZE.xl, '')
        : '';
    return `<a class="sidebar-nav-item"`
        + ` href="${href}"`
        + ` data-page-link="${key}">`
        + `${icon}`
        + ` <span class="sidebar-nav-text">`
        + `${entry.title}</span></a>`;
}

// The visible heading is hidden from assistive technology:
// the group's own label already names it.
function navGroupHtml(group: NavGroup): string {
    const links = Object.entries(PAGE_REGISTRY)
        .filter(([, entry]) => entry.inSidebarNav
            && entry.navGroup === group)
        .map(([key, entry]) => navLinkHtml(key, entry))
        .join('\n');
    return `<div class="sidebar-nav-group" role="group"`
        + ` aria-label="${group}">`
        + `<p class="sidebar-nav-heading"`
        + ` aria-hidden="true">${group}</p>\n`
        + `${links}</div>`;
}

export function buildSidebarNavItemsHtml(): string {
    return NAV_GROUPS.map(navGroupHtml).join('\n');
}
