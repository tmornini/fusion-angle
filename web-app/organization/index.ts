import { $ } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    trimStrings,
    openDialog, closeDialog,
} from '../app/core.ts';
import {
    getOrganization,
    getOrganizationStats,
    putOrganizationGeneralInfo,
    createRequestContext,
    Organization,
    type OrganizationStats,
    type GeneralInfoDraft,
    getActiveObjectives,
    getObjectives,
    getArchivedObjectiveIds,
    getCurrentObjectiveDefinition,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveArchival,
    postObjectiveReactivation,
    putObjectivePosition,
    subscribeObjectiveChanges,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';
import { initDragReorder } from '../app/drag-reorder.ts';
import {
    nextPosition,
} from '../app/drag-reorder-positions.ts';
import {
    OrganizationPresenter,
    OrganizationEditPresenter,
    type GeneralInfoFieldKey,
    OrganizationObjectivesPresenter,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        org: Organization;
        stats: OrganizationStats;
    }
    | {
        kind: 'editing';
        org: Organization;
        stats: OrganizationStats;
        draft: GeneralInfoDraft;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<GeneralInfoFieldKey> =
    new Set(['name', 'domain']);

function isFieldKey(
    s: string | null,
): s is GeneralInfoFieldKey {
    return s !== null
        && FIELDS.has(s as GeneralInfoFieldKey);
}

function buildPresenter():
    | OrganizationPresenter
    | OrganizationEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new OrganizationPresenter(
            state.org, state.stats,
        )
        : new OrganizationEditPresenter(
            state.org, state.stats, state.draft,
        );
}

async function rerender(): Promise<void> {
    if (!pageContainer) return;
    pageContainer.toggleAttribute(
        'data-page-editing',
        state?.kind === 'editing',
    );
    setHtml(
        pageContainer,
        buildPresenter().buildPage(),
    );
    await renderObjectives();
}

async function renderObjectives(): Promise<void> {
    const ctx = createRequestContext();
    const [active, allObjs, archivedIds] =
        await Promise.all([
            getActiveObjectives(ctx),
            getObjectives(ctx),
            getArchivedObjectiveIds(ctx),
        ]);
    const archived = allObjs.filter(
        o => archivedIds.has(o.id),
    );
    const defs = new Map<string,
        { name: string; description: string }>();
    for (const o of [...active, ...archived]) {
        defs.set(
            o.id,
            await getCurrentObjectiveDefinition(
                ctx, o.id,
            ),
        );
    }
    const archivedAt = new Map<string, string>();
    const presenter =
        new OrganizationObjectivesPresenter(
            active, archived, defs, archivedAt,
        );
    const box = $('#objectives-box', document);
    if (!box) return;
    setHtml(box, presenter.buildBox());

    const activeList = box.querySelector<HTMLElement>(
        '[data-list="active"]',
    );
    if (!activeList) return;
    initDragReorder(
        activeList,
        '[data-objective-id]',
        'data-objective-id',
        async (id, newPosition) => {
            const dragCtx = createRequestContext();
            await putObjectivePosition(
                dragCtx, id, newPosition,
            );
        },
    );
}

async function onObjectiveAction(
    e: MouseEvent,
): Promise<void> {
    const target = e.target as HTMLElement;
    const action = target
        .closest('[data-action]')
        ?.getAttribute('data-action');
    if (!action) return;
    const objectiveId = target
        .closest('[data-objective-id]')
        ?.getAttribute('data-objective-id');
    const ctx = createRequestContext();
    if (action === 'add-objective') {
        openDialog('add-objective');
    } else if (
        action === 'edit'
        && objectiveId
    ) {
        const def =
            await getCurrentObjectiveDefinition(
                ctx, objectiveId,
            );
        ($(
            '#edit-obj-id', document,
        ) as HTMLInputElement)
            .value = objectiveId;
        ($(
            '#edit-obj-name', document,
        ) as HTMLInputElement)
            .value = def.name;
        ($(
            '#edit-obj-description', document,
        ) as HTMLTextAreaElement)
            .value = def.description;
        openDialog('edit-objective');
    } else if (
        action === 'archive'
        && objectiveId
    ) {
        ($(
            '#confirm-archive-id', document,
        ) as HTMLInputElement)
            .value = objectiveId;
        openDialog('confirm-archive');
    } else if (
        action === 'reactivate'
        && objectiveId
    ) {
        await postObjectiveReactivation(
            ctx, objectiveId,
        );
    }
}

export async function init(): Promise<void> {
    const container =
        $('#organization-content', document);
    if (!container) return;
    pageContainer = container;
    bindStableListeners(container);

    setHtml(
        container,
        buildSkeleton('detail', 4),
    );

    let org: Organization;
    let stats: OrganizationStats;
    try {
        const ctx = createRequestContext();
        [org, stats] = await Promise.all([
            getOrganization(ctx),
            getOrganizationStats(ctx),
        ]);
    } catch (err) {
        log.error(
            'getOrganization failed',
            'organization',
            err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' organization data.',
                'Try Again',
            ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                'click', () => init(),
                { signal },
            );
        return;
    }

    state = { kind: 'reading', org, stats };
    subscribeObjectiveChanges(renderObjectives);
    await rerender();

    // Add-Objective dialog wiring
    $(
        '[data-action="cancel-add-objective"]',
        document,
    )!.addEventListener('click',
        () => closeDialog('add-objective'),
        { signal });
    $(
        '[data-action="confirm-add-objective"]',
        document,
    )!.addEventListener('click', async () => {
        const name = ($(
            '#add-obj-name', document,
        ) as HTMLInputElement).value;
        const desc = ($(
            '#add-obj-description', document,
        ) as HTMLTextAreaElement).value;
        const ctx = createRequestContext();
        const objs = await getObjectives(ctx);
        const position = nextPosition(
            objs.map(o => o.position),
        );
        const newId = generateCryptoSafeBase62();
        await postObjectiveCreation(
            ctx, newId, name, desc, position,
        );
        closeDialog('add-objective');
    }, { signal });

    // Edit-Objective dialog wiring
    $(
        '[data-action="cancel-edit-objective"]',
        document,
    )!.addEventListener('click',
        () => closeDialog('edit-objective'),
        { signal });
    $(
        '[data-action="confirm-edit-objective"]',
        document,
    )!.addEventListener('click', async () => {
        const id = ($(
            '#edit-obj-id', document,
        ) as HTMLInputElement).value;
        const name = ($(
            '#edit-obj-name', document,
        ) as HTMLInputElement).value;
        const desc = ($(
            '#edit-obj-description', document,
        ) as HTMLTextAreaElement).value;
        const ctx = createRequestContext();
        await postObjectiveRevision(
            ctx, id, name, desc,
        );
        closeDialog('edit-objective');
    }, { signal });

    // Confirm-archive dialog wiring
    $(
        '[data-action="cancel-confirm-archive"]',
        document,
    )!.addEventListener('click',
        () => closeDialog('confirm-archive'),
        { signal });
    $(
        '[data-action="confirm-archive"]',
        document,
    )!.addEventListener('click', async () => {
        const id = ($(
            '#confirm-archive-id', document,
        ) as HTMLInputElement).value;
        const ctx = createRequestContext();
        await postObjectiveArchival(ctx, id);
        closeDialog('confirm-archive');
    }, { signal });
}

function bindStableListeners(
    container: HTMLElement,
): void {
    container.addEventListener(
        'click', e => onClick(e),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e),
        { signal },
    );
}

function onClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
    const orgAction = target
        .closest('[data-org-action]')
        ?.getAttribute('data-org-action');
    if (orgAction === 'edit') {
        if (!state || state.kind !== 'reading') {
            return;
        }
        state = {
            kind: 'editing',
            org: state.org,
            stats: state.stats,
            draft: state.org
                .toGeneralInfoDraft(),
        };
        void rerender();
        return;
    }
    if (orgAction === 'cancel') {
        if (!state || state.kind !== 'editing') {
            return;
        }
        state = {
            kind: 'reading',
            org: state.org,
            stats: state.stats,
        };
        void rerender();
        return;
    }
    if (orgAction === 'save') {
        void handleSave();
        return;
    }
    void onObjectiveAction(e);
}

function onInput(e: Event): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target as
        | HTMLInputElement | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-org-field',
    );
    if (!isFieldKey(field)) return;
    state = {
        ...state,
        draft: {
            ...state.draft,
            [field]: target.value,
        },
    };
}

function onContainerKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    void handleSave();
}

function onDocumentKeydown(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Escape') return;
    if (!state || state.kind !== 'editing') {
        return;
    }
    e.preventDefault();
    state = {
        kind: 'reading',
        org: state.org,
        stats: state.stats,
    };
    void rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const trimmed = trimStrings(state.draft);
    const ctx = createRequestContext();
    try {
        await putOrganizationGeneralInfo(
            ctx, trimmed,
        );
    } catch (err) {
        log.error(
            'putOrganizationGeneralInfo failed',
            'organization',
            err,
        );
        showToast(
            'Failed to save organization',
            'error',
        );
        return;
    }
    showToast('Organization saved', 'success');
    const freshCtx = createRequestContext();
    const [freshOrg, freshStats] =
        await Promise.all([
            getOrganization(freshCtx),
            getOrganizationStats(freshCtx),
        ]);
    state = {
        kind: 'reading',
        org: freshOrg,
        stats: freshStats,
    };
    await rerender();
}
