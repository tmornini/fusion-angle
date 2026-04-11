import { $ } from './dom';
import { log } from './logger';
import { showToast } from './toast';

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
    const { getCurrentUser } =
        await import('./adapters');
    const { user, company } =
        await getCurrentUser();
    return {
        name: user.fullName(),
        company,
    };
}

export async function mutateSidebarUser(
): Promise<void> {
    let data: {
        name: string;
        company: string;
    };
    try {
        data =
            await getSidebarUser();
    } catch (err) {
        log.error(
            'getSidebarUser failed',
            'sidebar-user',
            err,
        );
        showToast(
            'Sidebar user info'
            + ' load failed',
            'error',
        );
        return;
    }
    for (const id of
        SIDEBAR_USER_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = data.name;
    }
    for (const id of
        SIDEBAR_USER_COMPANY_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                data.company;
    }
}
