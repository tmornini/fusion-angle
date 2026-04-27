import { $$, getRequiredAttribute } from './dom.ts';
import { getPageName } from './navigation.ts';

const NAV_GROUP_CHILDREN:
    Record<string, string[]> = {
        organization: [
            'users',
            'activity-feed',
        ],
        ideas: [
            'idea-create',
            'idea-convert',
            'idea-detail',
        ],
        projects: [
            'project-detail',
        ],
    };

export function initActiveNavItem(
): void {
    const pageName = getPageName();
    $$(
        '[data-page-link]', document,
    ).forEach(
        navLink => {
            const linkPage = getRequiredAttribute(
                navLink,
                'data-page-link',
            );
            const children =
                NAV_GROUP_CHILDREN[
                    linkPage
                ];
            const isActive =
                linkPage === pageName
                || (children
                    ? children.includes(
                        pageName,
                    )
                    : false);
            if (isActive)
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
