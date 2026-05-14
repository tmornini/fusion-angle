import { $ } from './dom.ts';
import { navigateTo } from './navigation.ts';

const SIDEBAR_WORKER_NAME_IDS = [
    'sidebar-worker-name',
    'mobile-sidebar-worker-name',
] as const;

const SIDEBAR_WORKER_ORG_IDS = [
    'sidebar-worker-org',
    'mobile-sidebar-worker-org',
] as const;

async function getSidebarWorker(
): Promise<{
    id: string;
    name: string;
    organization: string;
}> {
    const {
        createRequestContext,
        getCurrentHumanWorker,
        getOrganization,
        HumanWorker,
    } = await import('./adapters');
    const ctx = createRequestContext();
    const [workerRow, org] =
        await Promise.all([
            getCurrentHumanWorker(ctx),
            getOrganization(ctx),
        ]);
    return {
        id: workerRow.id,
        name: new HumanWorker(workerRow)
            .fullName(),
        organization: org.nameText(),
    };
}

export async function mutateSidebarWorker(
): Promise<void> {
    const sidebarWorker =
        await getSidebarWorker();
    for (const id of
        SIDEBAR_WORKER_NAME_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent = sidebarWorker.name;
    }
    for (const id of
        SIDEBAR_WORKER_ORG_IDS
    ) {
        const el =
            $(`#${id}`, document);
        if (el)
            el.textContent =
                sidebarWorker.organization;
    }
    const chips = document.querySelectorAll<
        HTMLElement
    >('.sidebar-worker');
    for (const chip of chips) {
        chip.addEventListener(
            'click',
            () => navigateTo(
                'worker-detail',
                { workerId: sidebarWorker.id },
            ),
        );
    }
}
