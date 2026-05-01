import { $ } from './dom.ts';

const SIDEBAR_USER_NAME_IDS = [
    'sidebar-user-name',
    'mobile-sidebar-user-name',
] as const;

const SIDEBAR_USER_COMPANY_IDS = [
    'sidebar-user-company',
    'mobile-sidebar-user-company',
] as const;

async function getSidebarUser(
): Promise<{
    name: string;
    company: string;
}> {
    const {
        createFetchContext,
        getCurrentUserRow,
        getCompanyRow,
        User,
    } = await import('./adapters');
    const ctx = createFetchContext();
    const [userRow, company] =
        await Promise.all([
            getCurrentUserRow(ctx),
            getCompanyRow(ctx),
        ]);
    return {
        name: new User(userRow).fullName(),
        company: company.name,
    };
}

export async function mutateSidebarUser(
): Promise<void> {
    const sidebarUser = await getSidebarUser();
    for (const id of
        SIDEBAR_USER_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = sidebarUser.name;
    }
    for (const id of
        SIDEBAR_USER_COMPANY_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                sidebarUser.company;
    }
}
