import { PAGE_REGISTRY } from './page-registry.ts';
import { ICON_SIZE } from './icons.ts';

export function buildSidebarNavItemsHtml(): string {
    return Object.entries(PAGE_REGISTRY)
        .filter(([, entry]) => entry.inSidebarNav)
        .map(([key, entry]) => {
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
        })
        .join('\n');
}
