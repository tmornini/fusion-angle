import { $$, getRequiredAttribute } from './dom.ts';
import { getPageName } from './navigation.ts';
import { PAGE_REGISTRY } from './page-registry.ts';

export function initActiveNavItem(): void {
    const pageName = getPageName();
    const entry = PAGE_REGISTRY[pageName];
    const activeKey =
        entry?.sidebarKey
        ?? (entry?.inSidebarNav
            ? pageName
            : undefined);
    $$('[data-page-link]', document).forEach(
        navLink => {
            const linkPage = getRequiredAttribute(
                navLink,
                'data-page-link',
            );
            if (linkPage === activeKey)
                navLink.setAttribute(
                    'aria-current',
                    'page',
                );
            else
                navLink.removeAttribute(
                    'aria-current',
                );
        },
    );
}
