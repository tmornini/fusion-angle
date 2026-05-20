import { $, $$, getRequiredAttribute } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    navigateTo, trimStrings,
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
    getDeprecatedObjectiveIds,
    getCurrentObjectiveDefinition,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveDeprecation,
    postObjectiveReactivation,
    postObjectiveReordering,
    subscribeObjectiveChanges,
    generateCryptoSafeBase62,
} from '../app/adapters/index.ts';
import { initDragReorder } from '../app/drag-reorder.ts';
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

function rerender(): void {
    if (!pageContainer) return;
    setHtml(
        pageContainer,
        buildPresenter().buildPage(),
    );
    bindNavButtons();
}

function bindNavButtons(): void {
    $$('[data-nav-to]', document).forEach(
        navButton => {
            navButton.addEventListener(
                'click',
                () => navigateTo(
                    getRequiredAttribute(
                        navButton, 'data-nav-to',
                    ),
                ),
                { signal },
            );
        },
    );
}

async function renderObjectives(): Promise<void> {
    const ctx = createRequestContext();
    const [active, allObjs, deprecatedIds] =
        await Promise.all([
            getActiveObjectives(ctx),
            getObjectives(ctx),
            getDeprecatedObjectiveIds(ctx),
        ]);
    const deprecated = allObjs.filter(
        o => deprecatedIds.has(o.id),
    );
    const defs = new Map<string,
        { name: string; description: string }>();
    for (const o of [...active, ...deprecated]) {
        defs.set(
            o.id,
            await getCurrentObjectiveDefinition(
                ctx, o.id,
            ),
        );
    }
    const deprecatedAt = new Map<string, string>();
    const presenter =
        new OrganizationObjectivesPresenter(
            active, deprecated, defs, deprecatedAt,
        );
    const box = $('#objectives-box', document);
    if (!box) return;
    setHtml(box, presenter.buildBox());
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
    rerender();

    subscribeObjectiveChanges(renderObjectives);
    await renderObjectives();

    const box = $('#objectives-box', document);
    if (box) {
        initDragReorder(
            box as HTMLElement,
            '[data-objective-id]'
            + ':not([data-deprecated="true"])',
            'data-objective-id',
            async (id, newPosition) => {
                const ctx = createRequestContext();
                const active =
                    await getActiveObjectives(ctx);
                const moved = active.find(
                    o => o.id === id,
                );
                if (!moved) return;
                const others = active.filter(
                    o => o.id !== id,
                );
                let insertIdx = others.findIndex(
                    o => o.position > newPosition,
                );
                if (insertIdx === -1) {
                    insertIdx = others.length;
                }
                const newOrder = [
                    ...others.slice(0, insertIdx),
                    moved,
                    ...others.slice(insertIdx),
                ];
                await postObjectiveReordering(
                    ctx, newOrder.map(o => o.id),
                );
            },
        );
    }

    // Click delegation on the objectives box
    $('#objectives-box', document)!
        .addEventListener('click',
            async (e) => {
                const target =
                    e.target as HTMLElement;
                const action = target
                    .closest('[data-action]')
                    ?.getAttribute('data-action');
                const objectiveId = target
                    .closest('[data-objective-id]')
                    ?.getAttribute(
                        'data-objective-id',
                    );
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
                        '#edit-obj-description',
                        document,
                    ) as HTMLTextAreaElement)
                        .value = def.description;
                    openDialog('edit-objective');
                } else if (
                    action === 'deprecate'
                    && objectiveId
                ) {
                    ($(
                        '#confirm-deprecate-id',
                        document,
                    ) as HTMLInputElement)
                        .value = objectiveId;
                    openDialog('confirm-deprecate');
                } else if (
                    action === 'reactivate'
                    && objectiveId
                ) {
                    await postObjectiveReactivation(
                        ctx, objectiveId,
                    );
                }
            }, { signal });

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
        const newId = generateCryptoSafeBase62();
        await postObjectiveCreation(
            ctx, newId, name, desc, objs.length,
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

    // Confirm-deprecate dialog wiring
    $(
        '[data-action="cancel-confirm-deprecate"]',
        document,
    )!.addEventListener('click',
        () => closeDialog('confirm-deprecate'),
        { signal });
    $(
        '[data-action="confirm-deprecate"]',
        document,
    )!.addEventListener('click', async () => {
        const id = ($(
            '#confirm-deprecate-id', document,
        ) as HTMLInputElement).value;
        const ctx = createRequestContext();
        await postObjectiveDeprecation(ctx, id);
        closeDialog('confirm-deprecate');
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
    const action = target
        .closest('[data-org-action]')
        ?.getAttribute('data-org-action');
    if (action === 'edit') {
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
        rerender();
        return;
    }
    if (action === 'cancel') {
        if (!state || state.kind !== 'editing') {
            return;
        }
        state = {
            kind: 'reading',
            org: state.org,
            stats: state.stats,
        };
        rerender();
        return;
    }
    if (action === 'save') {
        void handleSave();
    }
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
    rerender();
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
    rerender();
}
