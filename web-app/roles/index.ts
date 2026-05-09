import {
    $, $input, $textarea,
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
    iconShield, iconPlus, iconSearch,
} from '../app/icons.ts';
import {
    initDialog, openDialog, closeDialog,
    trimStrings,
} from '../app/core.ts';
import {
    createRequestContext,
    getPersistedRoles,
    getRoleMembershipRows,
    putRole,
    deleteRole,
    generateCryptoSafeBase62,
    subscribeRoleChanges,
    subscribeMembershipChanges,
    nowUtc,
} from '../app/adapters/index.ts';
import {
    RoleListPresenter,
    buildInitialRoleListState,
    applyRoleListSearch,
    applyRoleListUpdate,
    type RoleListState,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let roleState: RoleListState | null = null;
let roleListEl: HTMLElement | null = null;
let pendingDeleteId: string | null = null;

export async function init(): Promise<void> {
    const container = $(
        '#manage-roles-content', document,
    );
    if (!container) return;

    const ctx = createRequestContext();
    const loaded = await withLoadingState(
        container,
        buildSkeleton('table', 5),
        async () => {
            const [roles, memberships] =
                await Promise.all([
                    getPersistedRoles(ctx),
                    getRoleMembershipRows(ctx),
                ]);
            return { roles, memberships };
        },
        init,
    );
    if (!loaded) return;

    roleState = buildInitialRoleListState(
        loaded.roles, loaded.memberships,
    );
    setHtml(container, buildShellHtml());
    roleListEl = $('#role-list', document);
    if (roleListEl) {
        rerenderRoles();
        roleListEl.addEventListener(
            'click', onRoleListClick,
            { signal },
        );
    }

    bindSearch();
    bindCreateDialog();
    bindConfirmDeleteDialog();

    subscribeRoleChanges(refresh);
    subscribeMembershipChanges(refresh);
}

async function refresh(): Promise<void> {
    if (!roleState) return;
    const ctx = createRequestContext();
    const [roles, memberships] =
        await Promise.all([
            getPersistedRoles(ctx),
            getRoleMembershipRows(ctx),
        ]);
    roleState = applyRoleListUpdate(
        roleState, roles, memberships,
    );
    rerenderRoles();
}

function rerenderRoles(): void {
    if (!roleState || !roleListEl) return;
    new RoleListPresenter(roleState)
        .renderList(roleListEl);
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
                    }">Roles</h1>
                    <p class="text-muted">
                        Organize people into
                        named roles
                    </p>
                </div>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="create-role-btn">
                    ${iconPlus(16, '')}
                    New Role
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
                        id="role-search"
                        aria-label="${
                            'Search roles'
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
                        'role-list-icon'
                    }"></div>
                    <div class="${
                        'flex-2 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Role</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Members</div>
                    <div class="${
                        'table-action-cell'
                    }"></div>
                </div>
                <div id="role-list"></div>
            </div>

            ${buildCreateDialog()}
            ${buildConfirmDeleteDialog()}
        </div>`;
}

function buildCreateDialog(
): ReturnType<typeof html> {
    return html`
        <div id="create-role-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="create-role-dialog"
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
                    ${iconShield(20, '')}
                    New Role
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
                        id="create-role-name"
                        placeholder="${
                            'e.g. Engineering'
                        }" />
                </div>
                <div>
                    <label class="${
                        'label mb-1 block'
                    }">Description</label>
                    <textarea class="textarea"
                        rows="2"
                        id="${
                            'create-role-description'
                        }"
                        placeholder="${
                            'What does this'
                            + ' role do?'
                        }"></textarea>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="create-role-cancel">
                    Cancel
                </button>
                <button class="${
                    'btn btn-primary'
                }" id="create-role-submit">
                    Create
                </button>
            </div>
        </div>`;
}

function buildConfirmDeleteDialog(
): ReturnType<typeof html> {
    return html`
        <div id="confirm-delete-role-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="confirm-delete-role-dialog"
            class="${
                'dialog dialog-narrow hidden'
            }"
            role="alertdialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="dialog-title">
                    Delete role?
                </h3>
                <p class="dialog-description">
                    This removes the role and
                    every membership in it.
                </p>
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="${
                    'confirm-delete-role-cancel'
                }">
                    Cancel
                </button>
                <button class="${
                    'btn btn-destructive'
                }" id="${
                    'confirm-delete-role-submit'
                }">
                    Delete
                </button>
            </div>
        </div>`;
}

function bindSearch(): void {
    $input(
        '#role-search', document,
    )?.addEventListener(
        'input', onSearchInput,
        { signal },
    );
}

function onSearchInput(e: Event): void {
    if (!roleState || !roleListEl) return;
    const target =
        e.target as HTMLInputElement;
    roleState = applyRoleListSearch(
        roleState, target.value,
    );
    rerenderRoles();
}

function onRoleListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest(
        '[data-role-action="delete"]',
    );
    if (!btn) return;
    const roleId = btn.getAttribute(
        'data-role-id',
    );
    if (!roleId) return;
    pendingDeleteId = roleId;
    openDialog('confirm-delete-role');
}

function bindCreateDialog(): void {
    initDialog(
        'create-role',
        'create-role-btn',
        handleCreate,
    );
}

function bindConfirmDeleteDialog(): void {
    $(
        '#confirm-delete-role-submit', document,
    )?.addEventListener(
        'click', handleDelete, { signal },
    );
    $(
        '#confirm-delete-role-cancel', document,
    )?.addEventListener(
        'click',
        () => closeDialog('confirm-delete-role'),
        { signal },
    );
    $(
        '#confirm-delete-role-backdrop', document,
    )?.addEventListener(
        'click',
        e => {
            if (e.target === e.currentTarget) {
                closeDialog(
                    'confirm-delete-role',
                );
            }
        },
        { signal },
    );
}

async function handleCreate(): Promise<void> {
    const name = $input(
        '#create-role-name', document,
    )?.value ?? '';
    const description = $textarea(
        '#create-role-description', document,
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
        await putRole(
            createRequestContext(),
            id,
            {
                name: trimmed.name,
                description: trimmed.description,
                created_at: nowUtc(),
            },
        );
    } catch (err) {
        log.error(
            'putRole failed', 'roles', err,
        );
        showToast(
            'Failed to create role', 'error',
        );
        return;
    }
    showToast('Role created', 'success');
    const nameInput = $input(
        '#create-role-name', document,
    );
    const descInput = $textarea(
        '#create-role-description', document,
    );
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    closeDialog('create-role');
}

async function handleDelete(): Promise<void> {
    const id = pendingDeleteId;
    if (!id) return;
    pendingDeleteId = null;
    try {
        await deleteRole(
            createRequestContext(), id,
        );
    } catch (err) {
        log.error(
            'deleteRole failed', 'roles', err,
        );
        showToast(
            'Failed to delete role', 'error',
        );
        closeDialog('confirm-delete-role');
        return;
    }
    showToast('Role deleted', 'success');
    closeDialog('confirm-delete-role');
}
