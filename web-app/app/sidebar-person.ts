import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

const SIDEBAR_PERSON_NAME_IDS = [
    'sidebar-person-name',
    'mobile-sidebar-person-name',
] as const;

const SIDEBAR_PERSON_ORG_IDS = [
    'sidebar-person-org',
    'mobile-sidebar-person-org',
] as const;

async function getSidebarPerson(
): Promise<{
    id: string;
    name: string;
    organization: string;
}> {
    const {
        createFetchContext,
        getCurrentPersonRow,
        getOrganization,
        Person,
    } = await import('./adapters');
    const ctx = createFetchContext();
    const [personRow, org] =
        await Promise.all([
            getCurrentPersonRow(ctx),
            getOrganization(ctx),
        ]);
    return {
        id: personRow.id,
        name: new Person(personRow).fullName(),
        organization: org.nameText(),
    };
}

export async function mutateSidebarPerson(
): Promise<void> {
    const sidebarPerson =
        await getSidebarPerson();
    for (const id of
        SIDEBAR_PERSON_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = sidebarPerson.name;
    }
    for (const id of
        SIDEBAR_PERSON_ORG_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                sidebarPerson.organization;
    }
    const chips = document.querySelectorAll<
        HTMLElement
    >('.sidebar-person');
    for (const chip of chips) {
        chip.addEventListener(
            'click',
            () => navigateTo(
                'people-detail',
                { personId: sidebarPerson.id },
            ),
        );
    }
}
