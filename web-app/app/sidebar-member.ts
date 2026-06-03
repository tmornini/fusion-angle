import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

const SIDEBAR_MEMBER_NAME_IDS = [
    'sidebar-member-name',
    'mobile-sidebar-member-name',
] as const;

const SIDEBAR_MEMBER_ORG_IDS = [
    'sidebar-member-org',
    'mobile-sidebar-member-org',
] as const;

async function getSidebarMember(
): Promise<{
    id: string;
    name: string;
    organization: string;
}> {
    const {
        createRequestContext,
        getHumanMember,
        getOrganization,
        ERASED_MEMBER_NAME,
    } = await import('./adapters');
    const ctx = createRequestContext();
    const [member, org] =
        await Promise.all([
            getHumanMember(ctx, 'current'),
            getOrganization(ctx),
        ]);
    const pii = member.pii();
    return {
        id: member.idForLink(),
        name: pii.erased
            ? ERASED_MEMBER_NAME
            : pii.name,
        organization: org.nameText(),
    };
}

export async function mutateSidebarMember(
): Promise<void> {
    const sidebarMember =
        await getSidebarMember();
    for (const id of
        SIDEBAR_MEMBER_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = sidebarMember.name;
    }
    for (const id of
        SIDEBAR_MEMBER_ORG_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                sidebarMember.organization;
    }
    const chips = document.querySelectorAll<
        HTMLElement
    >('.sidebar-member');
    for (const chip of chips) {
        chip.addEventListener(
            'click',
            () => navigateTo(
                'member-detail',
                { memberId: sidebarMember.id },
            ),
        );
    }
}
