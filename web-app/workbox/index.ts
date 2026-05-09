import {
    $, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    iconMail, iconArchive, iconPlus,
} from '../app/icons.ts';
import {
    navigateTo,
    initTabs,
    initDropdown,
} from '../app/core.ts';
import {
    getWorkOrderRows,
    getWorkOrderTransitionRows,
    getWorkOrderClaimRows,
    getPersonMap,
    getCurrentPerson,
    getFlowsForCreation,
    postWorkOrderCreation,
    putWorkOrder,
    getMembersOfCrew,
    getCrewMap,
    getRoleMembershipRows,
    createRequestContext,
    generateCryptoSafeBase62,
    subscribeWorkOrderChanges,
    type RequestContext,
    type WorkOrderEntity,
    type Id,
} from '../app/adapters/index.ts';
import {
    WorkboxInboxPresenter,
    buildInboxItems,
    type InboxMode,
    type InboxItem,
} from '../app/presenters/index.ts';
import {
    initDragReorder,
} from '../app/drag-reorder.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let activePresenter:
    WorkboxInboxPresenter | null = null;
let workOrderEntities:
    Map<string, WorkOrderEntity> = new Map();

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    renderTabs();
    initTabs(
        '[data-tab]', '.tab-panel', 'active',
    );

    const activeEl =
        $('#active-list', document);
    const archiveEl =
        $('#archive-list', document);

    const ctx = createRequestContext();
    if (activeEl) {
        await initActiveList(activeEl, ctx);
    }
    if (archiveEl) {
        await initArchiveList(archiveEl, ctx);
    }

    subscribeWorkOrderChanges(() => {
        if (activeEl) {
            void rerenderInbox(
                activeEl, 'active', ctx,
            );
        }
        if (archiveEl) {
            void rerenderInbox(
                archiveEl, 'archived', ctx,
            );
        }
    });

    await initCreateDropdown(ctx);
}

async function rerenderInbox(
    listEl: HTMLElement,
    mode: InboxMode,
    ctx: RequestContext,
): Promise<void> {
    const items = await loadInboxItems(mode, ctx);
    const presenter = new WorkboxInboxPresenter(
        items, mode === 'active',
    );
    presenter.renderList(listEl);
    if (mode === 'active') {
        activePresenter = presenter;
    }
}

function renderTabs(): void {
    const tabsEl = $(
        '#workbox-tabs', document,
    );
    if (!tabsEl) return;
    setHtml(tabsEl, html`
        <span class="${
            'badge badge-success'
            + ' text-xs cursor-pointer active'
        }" data-tab="active">${
            iconMail(14, '')
        } Active</span>
        <span class="${
            'badge badge-default'
            + ' text-xs cursor-pointer'
        }" data-tab="archive">${
            iconArchive(14, '')
        } Archive</span>`);
}

async function loadInboxItems(
    mode: InboxMode,
    ctx: RequestContext,
): Promise<InboxItem[]> {
    const [
        workOrders, transitions,
        claims, personMap,
        currentPerson,
        scope,
    ] = await Promise.all([
        getWorkOrderRows(ctx),
        getWorkOrderTransitionRows(ctx),
        getWorkOrderClaimRows(ctx),
        getPersonMap(ctx),
        getCurrentPerson(ctx),
        buildVisibilityScope(ctx),
    ]);
    workOrderEntities = new Map(
        workOrders.map(w => [w.id, w]),
    );
    return buildInboxItems(
        workOrders, transitions, claims,
        personMap, mode,
        {
            currentPersonId: currentPerson.id,
            roleMemberSetByRoleId:
                scope.roleMemberSetByRoleId,
            crewMemberSetByCrewId:
                scope.crewMemberSetByCrewId,
        },
    );
}

async function buildVisibilityScope(
    ctx: RequestContext,
): Promise<{
    roleMemberSetByRoleId:
        ReadonlyMap<Id, ReadonlySet<Id>>;
    crewMemberSetByCrewId:
        ReadonlyMap<Id, ReadonlySet<Id>>;
}> {
    const [memberships, crewMap] =
        await Promise.all([
            getRoleMembershipRows(ctx),
            getCrewMap(ctx),
        ]);
    const roleMemberSetByRoleId =
        new Map<Id, Set<Id>>();
    for (const m of memberships) {
        const set =
            roleMemberSetByRoleId
                .get(m.role_id) ?? new Set();
        set.add(m.person_id);
        roleMemberSetByRoleId.set(
            m.role_id, set,
        );
    }
    const crewMemberSetByCrewId =
        new Map<Id, ReadonlySet<Id>>();
    for (const crewId of crewMap.keys()) {
        const members = await getMembersOfCrew(
            ctx, crewId,
        );
        crewMemberSetByCrewId.set(
            crewId, members,
        );
    }
    return {
        roleMemberSetByRoleId,
        crewMemberSetByCrewId,
    };
}

async function initActiveList(
    activeEl: HTMLElement,
    ctx: RequestContext,
): Promise<void> {
    const items = await withLoadingState(
        activeEl,
        buildSkeleton('card-list', 4),
        () => loadInboxItems('active', ctx),
        init,
        {
            icon: iconMail(24, ''),
            title:
                'No Active Work Orders Yet',
            description:
                'Create a work order to get'
                + ' started.',
        },
    );
    if (!items) return;

    activePresenter = new WorkboxInboxPresenter(
        items, true,
    );
    activePresenter.renderList(activeEl);
    bindRowNavigation(activeEl);

    initDragReorder(
        activeEl,
        '[data-work-order-card]',
        'data-work-order-card',
        async (id, newPosition) => {
            const entity =
                workOrderEntities.get(id);
            if (!entity) return;
            try {
                await putWorkOrder(ctx, id, {
                    ...entity,
                    position: newPosition,
                });
            } catch (err) {
                log.error(
                    'reorder failed',
                    'workbox', err,
                );
                showToast(
                    'Failed to save order',
                    'error',
                );
                return;
            }
            const refreshed =
                await loadInboxItems('active', ctx);
            activePresenter =
                new WorkboxInboxPresenter(
                    refreshed, true,
                );
            activePresenter.renderList(
                activeEl,
            );
        },
    );
}

async function initArchiveList(
    archiveEl: HTMLElement,
    ctx: RequestContext,
): Promise<void> {
    const items = await withLoadingState(
        archiveEl,
        buildSkeleton('card-list', 4),
        () => loadInboxItems('archived', ctx),
        init,
        {
            icon: iconMail(24, ''),
            title:
                'No Archived Work Orders Yet',
            description:
                'Completed work orders will'
                + ' appear here.',
        },
    );
    if (!items) return;

    const presenter = new WorkboxInboxPresenter(
        items, false,
    );
    presenter.renderList(archiveEl);
    bindRowNavigation(archiveEl);
}

function bindRowNavigation(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click', e => onRowClick(e),
        { signal },
    );
}

function onRowClick(e: MouseEvent): void {
    if (
        !(e.target instanceof Element)
    ) return;
    const card = e.target.closest<HTMLElement>(
        '[data-work-order-card]',
    );
    if (!card) return;
    const id = getRequiredAttribute(
        card, 'data-work-order-card',
    );
    navigateTo('workbox-detail', { id });
}

async function createWorkOrderForFlow(
    flowId: string,
    ctx: RequestContext,
): Promise<void> {
    const workOrderId =
        generateCryptoSafeBase62();
    const flowLinkId =
        generateCryptoSafeBase62();
    const initTransitionId =
        generateCryptoSafeBase62();
    const postStartTransitionId =
        generateCryptoSafeBase62();
    const claimId =
        generateCryptoSafeBase62();
    try {
        await postWorkOrderCreation(ctx, {
            workOrderId,
            flowLinkId,
            initTransitionId,
            postStartTransitionId,
            claimId,
            flowId,
        });
        showToast(
            'Work order created', 'success',
        );
        navigateTo(
            'workbox-detail',
            { id: workOrderId },
        );
    } catch (err) {
        log.error(
            'work order creation failed',
            'workbox', err,
        );
        showToast(
            'Failed to create work order',
            'error',
        );
    }
}

async function initCreateDropdown(
    ctx: RequestContext,
): Promise<void> {
    populateIcons([
        [
            '#create-work-order-btn-icon',
            iconPlus(16, ''),
        ],
    ]);

    const dropdownEl = $(
        '#create-work-order-dropdown',
        document,
    );
    if (!dropdownEl) return;

    const flows = await getFlowsForCreation(ctx);

    setHtml(dropdownEl, html`${flows.map(
        f => html`<button
            class="dropdown-item"
            data-flow-id="${f.id}"
        >${f.name}</button>`,
    )}`);

    initDropdown(
        'create-work-order-btn',
        'create-work-order-dropdown',
    );

    dropdownEl.addEventListener(
        'click',
        e => onDropdownClick(e, dropdownEl, ctx),
        { signal },
    );
}

function onDropdownClick(
    e: MouseEvent,
    dropdownEl: HTMLElement,
    ctx: RequestContext,
): void {
    if (
        !(e.target instanceof Element)
    ) return;
    const item = e.target.closest<HTMLElement>(
        '[data-flow-id]',
    );
    if (!item) return;
    const flowId = item.getAttribute(
        'data-flow-id',
    );
    if (!flowId) return;
    dropdownEl.classList.add('hidden');
    void createWorkOrderForFlow(flowId, ctx);
}
