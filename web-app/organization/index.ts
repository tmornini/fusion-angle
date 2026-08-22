import { $ } from '../app/dom.ts';
import {
    createPageAbort,
    bindPageListeners,
} from '../app/page-lifecycle.ts';
import {
    makeFieldKeyValidator,
} from '../app/field-key-validator.ts';
import { setHtml } from '../app/safe-html.ts';
import {
    buildSkeleton, buildErrorState, buildEmptyState,
} from '../app/loading-states.ts';
import { iconShield, ICON_SIZE } from '../app/icons.ts';
import {
    RequestError, HTTP_FORBIDDEN,
} from '../../api/http-errors.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import { extractErrorMessage } from '../app/error-helpers.ts';
import { trimStrings } from '../app/format.ts';
import {
    openDialog, closeDialog,
    handleDialogClick,
} from '../app/dialog.ts';
import {
    getOrganization,
    getOrganizationStats,
    putOrganizationGeneralInfo,
    sessionContext,
    Organization,
    type OrganizationStats,
    type GeneralInfoDraft,
    getActiveObjectives,
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveStateDetails,
    getCurrentObjectiveDefinition,
    getCurrentObjectiveDefinitions,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveArchival,
    postObjectiveReactivation,
    putObjectivePosition,
    subscribeObjectiveChanges,
    getSentInvitations,
    postInvitationRevocation,
    subscribeInvitationChanges,
    generateIdentifier,
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
    SentInvitationsPresenter,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

type PageState =
    | {
        kind: 'reading';
        organization: Organization;
        stats: OrganizationStats;
    }
    | {
        kind: 'editing';
        organization: Organization;
        stats: OrganizationStats;
        draft: GeneralInfoDraft;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<GeneralInfoFieldKey> =
    new Set(['name', 'domain']);

const isFieldKey = makeFieldKeyValidator(FIELDS);

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
            state.organization, state.stats,
        )
        : new OrganizationEditPresenter(
            state.organization, state.stats, state.draft,
        );
}

async function rerenderShellOnly(): Promise<void> {
    if (!pageContainer) return;
    pageContainer.toggleAttribute(
        'data-page-editing',
        state?.kind === 'editing',
    );
    setHtml(
        pageContainer,
        buildPresenter().buildPage(),
    );
}

async function rerender(): Promise<void> {
    await rerenderShellOnly();
    await renderObjectives();
}

interface ObjectivesData {
    active: Awaited<
        ReturnType<typeof getActiveObjectives>
    >;
    archived: Awaited<
        ReturnType<typeof getObjectives>
    >;
    defs: Awaited<
        ReturnType<
            typeof getCurrentObjectiveDefinitions
        >
    >;
    archivedAt: Map<string, string>;
    stateDetails: Awaited<
        ReturnType<typeof getObjectiveStateDetails>
    >;
}

async function fetchObjectivesData(
    ctx: ReturnType<typeof sessionContext>,
): Promise<ObjectivesData> {
    // One bulk trio read per load — drag-reorder echoes
    // each id's detail from this map (no per-drag GET).
    const [active, allObjs, archivedIds, stateDetails] =
        await Promise.all([
            getActiveObjectives(ctx),
            getObjectives(ctx),
            getArchivedObjectiveIds(ctx),
            getObjectiveStateDetails(ctx),
        ]);
    const archived = allObjs.filter(
        o => archivedIds.has(o.id),
    );
    const defs =
        await getCurrentObjectiveDefinitions(
            ctx,
            [...active, ...archived]
                .map(o => o.id),
        );
    return {
        active,
        archived,
        defs,
        archivedAt: new Map<string, string>(),
        stateDetails,
    };
}

function paintObjectives(
    data: ObjectivesData,
): void {
    const presenter =
        new OrganizationObjectivesPresenter(
            data.active,
            data.archived,
            data.defs,
            data.archivedAt,
        );
    const box = $('#objectives-box', document);
    if (!box) return;
    setHtml(box, presenter.buildBox());

    const activeList = $(
        '[data-list="active"]', box,
    );
    if (!activeList) return;
    const stateDetails = data.stateDetails;
    initDragReorder(
        activeList,
        '[data-objective-id]',
        'data-objective-id',
        async (id, newPosition) => {
            const dragCtx = sessionContext();
            const detail = stateDetails.get(id);
            if (detail === undefined) {
                throw new Error(
                    'no state detail for objective '
                        + id,
                );
            }
            await putObjectivePosition(
                dragCtx, id, newPosition, detail,
            );
        },
    );
}

async function renderObjectives(): Promise<void> {
    const data = await fetchObjectivesData(
        sessionContext(),
    );
    paintObjectives(data);
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
    const ctx = sessionContext();
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

    const ctx = sessionContext();
    // Wave 1: org shell + objectives + sent invitations
    // in parallel. Org-pair rejection takes precedence
    // (403 notice / error body) before other failures.
    const [
        organizationPair, objectivesResult, sentResult,
    ] = await Promise.allSettled([
        Promise.all([
            getOrganization(ctx),
            getOrganizationStats(ctx),
        ]),
        fetchObjectivesData(ctx),
        fetchSentInvitations(ctx),
    ]);

    if (organizationPair.status === 'rejected') {
        const err = organizationPair.reason;
        if (err instanceof RequestError
            && err.status === HTTP_FORBIDDEN) {
            // The organization page is admin-only. A non-admin
            // member who reaches it gets an honest notice, not a
            // generic error whose Try Again can only 403 again.
            setHtml(
                container,
                buildEmptyState(
                    iconShield(ICON_SIZE['2xl'], ''),
                    'Admin access required',
                    'Organization settings are available'
                    + ' to organization admins.',
                ),
            );
            return;
        }
        log.error(
            'organization page load failed',
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
        $('[data-retry-btn]', container)
            ?.addEventListener(
                'click', () => init(),
                { signal },
            );
        return;
    }

    const [organization, stats] =
        organizationPair.value;
    state = { kind: 'reading', organization, stats };
    subscribeObjectiveChanges(renderObjectives);
    subscribeInvitationChanges(
        () => void renderSentInvitations());
    // Shell render first (objectives box is empty shell);
    // then paint the parallel-fetched side panels.
    await rerenderShellOnly();
    if (objectivesResult.status === 'fulfilled') {
        paintObjectives(objectivesResult.value);
    } else {
        log.error(
            'organization objectives load failed',
            'organization',
            objectivesResult.reason,
        );
    }
    if (sentResult.status === 'fulfilled') {
        paintSentInvitations(sentResult.value);
    } else {
        log.error(
            'organization invitations load failed',
            'organization',
            sentResult.reason,
        );
    }
    $('#sent-invitations-list', document)
        ?.addEventListener(
            'click',
            e => void onSentInvitationClick(e),
            { signal },
        );

    // Add-Objective dialog wiring
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
        const ctx = sessionContext();
        const objs = await getObjectives(ctx);
        const position = nextPosition(
            objs.map(o => o.position),
        );
        const newId = generateIdentifier();
        await postObjectiveCreation(
            ctx, newId, name, desc, position,
        );
        closeDialog('add-objective');
    }, { signal });

    // Edit-Objective dialog wiring
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
        const ctx = sessionContext();
        await postObjectiveRevision(
            ctx, id, name, desc,
        );
        closeDialog('edit-objective');
    }, { signal });

    // Confirm-archive dialog wiring
    $(
        '[data-action="confirm-archive"]',
        document,
    )!.addEventListener('click', async () => {
        const id = ($(
            '#confirm-archive-id', document,
        ) as HTMLInputElement).value;
        const ctx = sessionContext();
        await postObjectiveArchival(ctx, id);
        closeDialog('confirm-archive');
    }, { signal });
}

// The org's outstanding (pending) invitations, with a Revoke
// per row. Admin-only — the org page already requires admin,
// so a failure here is unexpected and surfaces loudly: the
// boot path renders the page error state, refresh paths toast
// through the global spine.
async function fetchSentInvitations(
    ctx: ReturnType<typeof sessionContext>,
) {
    return getSentInvitations(ctx);
}

function paintSentInvitations(
    sent: Awaited<
        ReturnType<typeof getSentInvitations>
    >,
): void {
    const box = $('#sent-invitations-box', document);
    const list = $('#sent-invitations-list', document);
    if (!box || !list) return;
    new SentInvitationsPresenter(sent).render(list);
    box.classList.remove('hidden');
}

async function renderSentInvitations(): Promise<void> {
    const sent = await fetchSentInvitations(
        sessionContext(),
    );
    paintSentInvitations(sent);
}

async function onSentInvitationClick(
    e: MouseEvent,
): Promise<void> {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest(
        '[data-invitation-action="revoke"]');
    if (!btn) return;
    const id = target
        .closest('[data-invitation-id]')
        ?.getAttribute('data-invitation-id');
    if (!id) return;
    try {
        await postInvitationRevocation(
            sessionContext(), id);
        showToast('Invitation revoked', 'success');
    } catch (err) {
        log.error(
            'postInvitationRevocation failed',
            'organization', err,
        );
        showToast(
            'Failed to revoke: '
            + extractErrorMessage(err), 'error',
        );
        return;
    }
    await renderSentInvitations();
}

function bindStableListeners(
    container: HTMLElement,
): void {
    bindPageListeners(container, {
        click: e => onClick(e),
        input: e => onInput(e),
        keydown: e => onContainerKeydown(e),
    }, signal);
    // The objective dialogs sit outside the page container, so
    // their open/cancel/backdrop clicks route through a document
    // delegate — one voice with every other dialog surface.
    document.addEventListener(
        'click',
        e => {
            const target = e.target;
            if (target instanceof Element) {
                handleDialogClick(target, e);
            }
        },
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
    const organizationAction = target
        .closest('[data-org-action]')
        ?.getAttribute('data-org-action');
    if (organizationAction === 'edit') {
        if (!state || state.kind !== 'reading') {
            return;
        }
        state = {
            kind: 'editing',
            organization: state.organization,
            stats: state.stats,
            draft: state.organization
                .toGeneralInfoDraft(),
        };
        void rerender();
        return;
    }
    if (organizationAction === 'cancel') {
        if (!state || state.kind !== 'editing') {
            return;
        }
        state = {
            kind: 'reading',
            organization: state.organization,
            stats: state.stats,
        };
        void rerender();
        return;
    }
    if (organizationAction === 'save') {
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
        organization: state.organization,
        stats: state.stats,
    };
    void rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const trimmed = trimStrings(state.draft);
    const ctx = sessionContext();
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
    const [freshOrganization, freshStats] =
        await Promise.all([
            getOrganization(ctx),
            getOrganizationStats(ctx),
        ]);
    state = {
        kind: 'reading',
        organization: freshOrganization,
        stats: freshStats,
    };
    await rerender();
}
