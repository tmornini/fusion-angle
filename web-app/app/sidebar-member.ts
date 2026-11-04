import { $, $$ } from './dom.ts';
import { navigateTo } from './navigation.ts';

const SIDEBAR_MEMBER_NAME_IDS = [
    'sidebar-member-name',
    'mobile-sidebar-member-name',
] as const;

export function sidebarMemberNavigation(
    identityId: string,
): readonly [string, { identityId: string }] {
    return [
        'identity-detail',
        { identityId },
    ];
}

export async function mutateSidebarMember(
): Promise<void> {
    const { sessionContext } = await import(
        './client.ts'
    );
    const identity = sessionContext().identity;
    for (const id of SIDEBAR_MEMBER_NAME_IDS) {
        const el = $(`#${id}`, document);
        if (el) el.textContent = identity.name;
    }
    const [page, params] = sidebarMemberNavigation(
        identity.id,
    );
    const chips = $$('.sidebar-member', document);
    for (const chip of chips) {
        chip.addEventListener('click', () => {
            navigateTo(page, params);
        });
    }
}
