import {
    $, $input, $select, $textarea,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    iconBriefcase, iconPlus, iconSearch,
} from '../app/icons.ts';
import {
    initDialog, openDialog, closeDialog,
    trimStrings,
} from '../app/core.ts';
import {
    createFetchContext,
    getCrews,
    putCrew,
    deleteCrew,
    addRoleToCrew,
    removeRoleFromCrew,
    getPersistedRoles,
    generateCryptoSafeBase62,
    subscribeCrewChanges,
    subscribeCrewRoleMembershipChanges,
    subscribeRoleChanges,
    nowUtc,
} from '../app/adapters/index.ts';
import {
    CrewListPresenter,
    buildInitialCrewListState,
    applyCrewListSearch,
    applyCrewListToggleExpand,
    applyCrewListUpdate,
    type CrewListState,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let crewState: CrewListState | null = null;
let crewListEl: HTMLElement | null = null;
let pendingDeleteId: string | null = null;

export async function init(): Promise<void> {
    const container = $(
        '#manage-crews-content', document,
    );
    if (!container) return;

    const ctx = createFetchContext();
    const loaded = await withLoadingState(
        container,
        buildSkeleton('table', 5),
        async () => {
            const [
                crews, memberships,
                roleMap, personMap,
                persistedRoles,
            ] = await Promise.all([
                getCrews(ctx),
                ctx.getCrewRoleMembershipRows(),
                ctx.getRoleMap(),
                ctx.getPersonMap(),
                getPersistedRoles(ctx),
            ]);
            return {
                crews, memberships,
                roleMap, personMap,
                persistedRoles,
            };
        },
        init,
    );
    if (!loaded) return;

    crewState = buildInitialCrewListState(
        loaded.crews,
        loaded.memberships,
        loaded.roleMap,
        loaded.personMap,
        loaded.persistedRoles,
    );
    setHtml(container, buildShellHtml());
    crewListEl = $('#crew-list', document);
    if (crewListEl) {
        rerenderCrews();
        crewListEl.addEventListener(
            'click', onCrewListClick,
            { signal },
        );
    }

    bindSearch();
    bindCreateDialog();
    bindConfirmDeleteDialog();

    subscribeCrewChanges(refresh);
    subscribeCrewRoleMembershipChanges(refresh);
    subscribeRoleChanges(refresh);
}

async function refresh(): Promise<void> {
    if (!crewState) return;
    const ctx = createFetchContext();
    const [
        crews, memberships, roleMap,
        personMap, persistedRoles,
    ] = await Promise.all([
        getCrews(ctx),
        ctx.getCrewRoleMembershipRows(),
        ctx.getRoleMap(),
        ctx.getPersonMap(),
        getPersistedRoles(ctx),
    ]);
    crewState = applyCrewListUpdate(
        crewState,
        crews, memberships,
        roleMap, personMap,
        persistedRoles,
    );
    rerenderCrews();
}

function rerenderCrews(): void {
    if (!crewState || !crewListEl) return;
    new CrewListPresenter(crewState)
        .renderList(crewListEl);
}

function buildShellHtml(
): ReturnType<typeof html> {
    return html`
        <div class="content-wrap-lg">
            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <div>
                    <h1 class="${
                        'text-3xl font-display'
                        + ' font-bold mb-2'
                    }">Crews</h1>
                    <p class="text-muted">
                        Group roles into crews
                    </p>
                </div>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="create-crew-btn">
                    ${iconPlus(16, '')}
                    New Crew
                </button>
            </div>

            <div class="${
                'flex items-center'
                + ' gap-4 mb-6'
            }">
                <div class="${
                    'search-wrapper flex-1'
                    + ' search-wrapper-md'
                }">
                    <span class="search-icon">
                        ${iconSearch(16, '')}
                    </span>
                    <input class="${
                        'input search-input'
                    }"
                        placeholder="${
                            'Search by name'
                            + ' or description...'
                        }"
                        id="crew-search"
                        aria-label="${
                            'Search crews'
                        }" />
                </div>
            </div>

            <div class="${
                'card overflow-hidden'
            }">
                <div class="${
                    'flex items-center'
                    + ' gap-4 p-4'
                    + ' table-header-row'
                }">
                    <div class="${
                        'crew-list-icon'
                    }"></div>
                    <div class="${
                        'flex-2 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Crew</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Roles</div>
                    <div class="${
                        'crew-list-chevron'
                    }"></div>
                    <div class="${
                        'table-action-cell'
                    }"></div>
                </div>
                <div id="crew-list"></div>
            </div>

            ${buildCreateDialog()}
            ${buildConfirmDeleteDialog()}
        </div>`;
}

function buildCreateDialog(
): ReturnType<typeof html> {
    return html`
        <div id="create-crew-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="create-crew-dialog"
            class="${
                'dialog hidden'
            }"
            role="dialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="${
                    'dialog-title'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconBriefcase(20, '')}
                    New Crew
                </h3>
            </div>
            <div class="${
                'flex flex-col gap-3 py-4'
            }">
                <div>
                    <label class="${
                        'label mb-1 block'
                    }">Name</label>
                    <input class="input"
                        id="create-crew-name"
                        placeholder="${
                            'e.g. Delivery'
                        }" />
                </div>
                <div>
                    <label class="${
                        'label mb-1 block'
                    }">Description</label>
                    <textarea class="textarea"
                        rows="2"
                        id="${
                            'create-crew-description'
                        }"
                        placeholder="${
                            'What does this'
                            + ' crew do?'
                        }"></textarea>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="create-crew-cancel">
                    Cancel
                </button>
                <button class="${
                    'btn btn-primary'
                }" id="create-crew-submit">
                    Create
                </button>
            </div>
        </div>`;
}

function buildConfirmDeleteDialog(
): ReturnType<typeof html> {
    return html`
        <div id="confirm-delete-crew-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="confirm-delete-crew-dialog"
            class="${
                'dialog dialog-narrow hidden'
            }"
            role="alertdialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="dialog-title">
                    Delete crew?
                </h3>
                <p class="dialog-description">
                    This removes the crew and
                    every role membership in it.
                </p>
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="${
                    'confirm-delete-crew-cancel'
                }">
                    Cancel
                </button>
                <button class="${
                    'btn btn-destructive'
                }" id="${
                    'confirm-delete-crew-submit'
                }">
                    Delete
                </button>
            </div>
        </div>`;
}

function bindSearch(): void {
    $input(
        '#crew-search', document,
    )?.addEventListener(
        'input', onSearchInput,
        { signal },
    );
}

function onSearchInput(e: Event): void {
    if (!crewState || !crewListEl) return;
    const target =
        e.target as HTMLInputElement;
    crewState = applyCrewListSearch(
        crewState, target.value,
    );
    rerenderCrews();
}

function onCrewListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const removeBtn = target.closest(
        '[data-crew-role-action="remove"]',
    );
    if (removeBtn) {
        e.stopPropagation();
        const membershipId =
            removeBtn.getAttribute(
                'data-membership-id',
            );
        if (membershipId) {
            handleRemoveRole(membershipId);
        }
        return;
    }

    const addBtn = target.closest(
        '[data-crew-role-action="add"]',
    );
    if (addBtn) {
        e.stopPropagation();
        const crewId = addBtn.getAttribute(
            'data-crew-id',
        );
        if (crewId) handleAddRole(crewId);
        return;
    }

    const deleteBtn = target.closest(
        '[data-crew-action="delete"]',
    );
    if (deleteBtn) {
        e.stopPropagation();
        const crewId = deleteBtn.getAttribute(
            'data-crew-id',
        );
        if (crewId) {
            pendingDeleteId = crewId;
            openDialog('confirm-delete-crew');
        }
        return;
    }

    const toggleRow = target.closest(
        '[data-crew-action="toggle"]',
    );
    if (toggleRow) {
        const crewId = toggleRow.getAttribute(
            'data-crew-id',
        );
        if (crewId && crewState) {
            crewState = applyCrewListToggleExpand(
                crewState, crewId,
            );
            rerenderCrews();
        }
    }
}

function bindCreateDialog(): void {
    initDialog(
        'create-crew',
        'create-crew-btn',
        handleCreate,
    );
}

function bindConfirmDeleteDialog(): void {
    $(
        '#confirm-delete-crew-submit', document,
    )?.addEventListener(
        'click', handleDelete, { signal },
    );
    $(
        '#confirm-delete-crew-cancel', document,
    )?.addEventListener(
        'click',
        () => closeDialog('confirm-delete-crew'),
        { signal },
    );
    $(
        '#confirm-delete-crew-backdrop', document,
    )?.addEventListener(
        'click',
        e => {
            if (e.target === e.currentTarget) {
                closeDialog(
                    'confirm-delete-crew',
                );
            }
        },
        { signal },
    );
}

async function handleCreate(): Promise<void> {
    const name = $input(
        '#create-crew-name', document,
    )?.value ?? '';
    const description = $textarea(
        '#create-crew-description', document,
    )?.value ?? '';
    const trimmed = trimStrings({
        name, description,
    });
    if (trimmed.name === '') {
        showToast('Name is required', 'error');
        return;
    }
    const id = generateCryptoSafeBase62();
    try {
        await putCrew(
            createFetchContext(),
            id,
            {
                name: trimmed.name,
                description: trimmed.description,
                created_at: nowUtc(),
            },
        );
    } catch (err) {
        log.error(
            'putCrew failed', 'crews', err,
        );
        showToast(
            'Failed to create crew', 'error',
        );
        return;
    }
    showToast('Crew created', 'success');
    const nameInput = $input(
        '#create-crew-name', document,
    );
    const descInput = $textarea(
        '#create-crew-description', document,
    );
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    closeDialog('create-crew');
}

async function handleDelete(): Promise<void> {
    const id = pendingDeleteId;
    if (!id) return;
    pendingDeleteId = null;
    try {
        await deleteCrew(
            createFetchContext(), id,
        );
    } catch (err) {
        log.error(
            'deleteCrew failed', 'crews', err,
        );
        showToast(
            'Failed to delete crew', 'error',
        );
        closeDialog('confirm-delete-crew');
        return;
    }
    showToast('Crew deleted', 'success');
    closeDialog('confirm-delete-crew');
}

async function handleAddRole(
    crewId: string,
): Promise<void> {
    const select = $select(
        `.crew-add-role-select`
        + `[data-crew-id="${crewId}"]`,
        document,
    );
    if (!select) return;
    const roleId = select.value;
    if (!roleId) return;
    try {
        await addRoleToCrew(
            createFetchContext(),
            crewId, roleId,
        );
    } catch (err) {
        log.error(
            'addRoleToCrew failed',
            'crews', err,
        );
        showToast(
            'Failed to add role', 'error',
        );
        return;
    }
    showToast('Role added', 'success');
}

async function handleRemoveRole(
    membershipId: string,
): Promise<void> {
    try {
        await removeRoleFromCrew(
            createFetchContext(),
            membershipId,
        );
    } catch (err) {
        log.error(
            'removeRoleFromCrew failed',
            'crews', err,
        );
        showToast(
            'Failed to remove role', 'error',
        );
        return;
    }
    showToast('Role removed', 'success');
}
