import {
    $, $input, $select,
} from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import { log } from '../app/logger';
import {
    iconUsers, iconUserPlus, iconSearch,
    iconChevronRight, iconSend,
} from '../app/icons';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core';
import {
    getManagedUsers, getUserEntity, putUser,
    postActivity,
    jsonArrayField,
    jsonObjectField,
    nowUtc,
} from '../app/adapters';
import {
    ManagedUsersPresenter,
} from '../app/presenters';

const DEFAULT_DIM = 50;

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter:
    ManagedUsersPresenter | null = null;
let userListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const container = $(
        '#manage-users-content', document,
    );
    if (!container) return;

    const users = await withLoadingState(
        container,
        buildSkeleton('table', 5),
        getManagedUsers,
        init,
        {
            icon: iconUsers(24, ''),
            title: 'No Users Yet',
            description:
                'Invite users to your'
                + ' organization to start'
                + ' collaborating.',
        },
    );
    if (!users) return;

    presenter = new ManagedUsersPresenter(users);
    setHtml(container, buildShellHtml(
        presenter.activeCount(),
        presenter.pendingCount(),
    ));

    userListEl = $('#user-list', document);
    if (userListEl) {
        presenter.renderList(userListEl);
        userListEl.addEventListener(
            'click', onUserListClick,
            { signal },
        );
    }

    bindFilters();
    bindInviteDialog();
}

function buildShellHtml(
    activeCount: number,
    pendingCount: number,
): ReturnType<typeof html> {
    return html`
        <div class="content-wrap-lg">
            <nav class="${
                'flex items-center'
                + ' gap-2 text-sm'
                + ' text-muted mb-6'
            }">
                <a href="index.html"
                    class="text-primary">
                    Organization
                </a>
                ${iconChevronRight(14, '')}
                <span>Manage Users</span>
            </nav>

            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <div>
                    <h1 class="${
                        'text-3xl font-display'
                        + ' font-bold mb-2'
                    }">Manage Users</h1>
                    <p class="text-muted">
                        ${activeCount}
                        active users,
                        ${pendingCount}
                        pending invitations
                    </p>
                </div>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="invite-btn">
                    ${iconUserPlus(16, '')}
                    Invite User
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
                            + ' or email...'
                        }"
                        id="user-search"
                        aria-label="${
                            'Search by name'
                            + ' or email'
                        }" />
                </div>
                <select class="${
                    'input input-narrow'
                }" id="role-filter"
                    aria-label="${
                        'Filter by role'
                    }">
                    <option value="all">
                        All Roles
                    </option>
                    <option value="admin">
                        Admin
                    </option>
                    <option value="manager">
                        Manager
                    </option>
                    <option value="member">
                        Member
                    </option>
                    <option value="viewer">
                        Viewer
                    </option>
                </select>
                <select class="${
                    'input input-narrow'
                }" id="status-filter"
                    aria-label="${
                        'Filter by status'
                    }">
                    <option value="all">
                        All Status
                    </option>
                    <option value="active">
                        Active
                    </option>
                    <option value="pending">
                        Pending
                    </option>
                    <option value="${
                        'deactivated'
                    }">Deactivated</option>
                </select>
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
                        'flex-2 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">User</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Role</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Department</div>
                    <div class="${
                        'flex-1 text-xs'
                        + ' font-medium'
                        + ' text-muted'
                    }">Status</div>
                    <div class="${
                        'table-action-cell'
                    }"></div>
                </div>
                <div id="user-list"></div>
            </div>

            ${buildInviteDialog()}
        </div>`;
}

function buildInviteDialog(
): ReturnType<typeof html> {
    return html`
        <div id="invite-backdrop"
            class="${
                'dialog-backdrop hidden'
            }"></div>
        <div id="invite-dialog"
            class="${
                'dialog dialog-wide hidden'
            }"
            role="dialog"
            aria-modal="true">
            <div class="dialog-header">
                <h3 class="${
                    'dialog-title'
                    + ' flex items-center'
                    + ' gap-2'
                }">
                    ${iconUserPlus(20, '')}
                    Add User
                </h3>
            </div>
            <div class="${
                'flex flex-col gap-3 py-4'
                + ' dialog-scroll'
            }">
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">First Name</label>
                        <input class="input"
                            id="invite-first"
                            placeholder="${
                                'First name'
                            }" />
                    </div>
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Last Name</label>
                        <input class="input"
                            id="invite-last"
                            placeholder="${
                                'Last name'
                            }" />
                    </div>
                </div>
                <div>
                    <label class="${
                        'label mb-1 block'
                    }">Email</label>
                    <input class="input"
                        type="email"
                        placeholder="${
                            'user@company.com'
                        }"
                        id="invite-email" />
                </div>
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Role</label>
                        <select class="input"
                            id="invite-role">
                            <option value="${
                                'member'
                            }">Member</option>
                            <option value="${
                                'admin'
                            }">Admin</option>
                            <option value="${
                                'manager'
                            }">Manager</option>
                            <option value="${
                                'viewer'
                            }">Viewer</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Department</label>
                        <select class="input"
                            id="${
                                'invite-department'
                            }">
                            <option value="${
                                'Engineering'
                            }">Engineering</option>
                            <option value="${
                                'Product'
                            }">Product</option>
                            <option value="${
                                'Design'
                            }">Design</option>
                            <option value="${
                                'Sales'
                            }">Sales</option>
                            <option value="${
                                'Operations'
                            }">Operations</option>
                            <option value="${
                                'Analytics'
                            }">Analytics</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Status</label>
                        <select class="input"
                            id="invite-status">
                            <option value="${
                                'active'
                            }">Active</option>
                            <option value="${
                                'pending'
                            }">Pending</option>
                            <option value="${
                                'deactivated'
                            }">Deactivated</option>
                        </select>
                    </div>
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Phone</label>
                        <input class="input"
                            id="invite-phone"
                            placeholder="${
                                '+1 (555) 000-0000'
                            }" />
                    </div>
                </div>
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Availability %</label>
                        <input class="input"
                            type="number"
                            min="0" max="100"
                            id="invite-avail"
                            placeholder="0-100" />
                    </div>
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Performance</label>
                        <input class="input"
                            type="number"
                            min="0" max="100"
                            id="invite-perf"
                            placeholder="0-100" />
                    </div>
                </div>
                <div>
                    <label class="${
                        'label mb-1 block'
                    }">Bio</label>
                    <textarea class="textarea"
                        rows="2"
                        id="invite-bio"
                        placeholder="${
                            'Short bio...'
                        }"></textarea>
                </div>
            </div>
            <div class="dialog-footer">
                <button class="${
                    'btn btn-outline'
                }" id="invite-cancel">
                    Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="invite-submit">
                    ${iconSend(16, '')}
                    Add User
                </button>
            </div>
        </div>`;
}

function bindFilters(): void {
    $input('#user-search', document)
        ?.addEventListener(
            'input', onSearchInput,
            { signal },
        );
    $select('#role-filter', document)
        ?.addEventListener(
            'change', onRoleChange,
            { signal },
        );
    $select('#status-filter', document)
        ?.addEventListener(
            'change', onStatusChange,
            { signal },
        );
}

function onSearchInput(e: Event): void {
    if (!presenter || !userListEl) return;
    const target =
        e.target as HTMLInputElement;
    presenter.setSearch(target.value);
    presenter.renderList(userListEl);
}

function onRoleChange(e: Event): void {
    if (!presenter || !userListEl) return;
    const target =
        e.target as HTMLSelectElement;
    presenter.setRole(target.value);
    presenter.renderList(userListEl);
}

function onStatusChange(e: Event): void {
    if (!presenter || !userListEl) return;
    const target =
        e.target as HTMLSelectElement;
    presenter.setStatus(target.value);
    presenter.renderList(userListEl);
}

function onUserListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const deactivate = target.closest(
        '[data-deactivate-user]',
    );
    if (deactivate) {
        const id = deactivate.getAttribute(
            'data-deactivate-user',
        );
        if (id) {
            void changeUserStatus(
                id, 'deactivated',
            );
        }
        return;
    }
    const reactivate = target.closest(
        '[data-reactivate-user]',
    );
    if (reactivate) {
        const id = reactivate.getAttribute(
            'data-reactivate-user',
        );
        if (id) {
            void changeUserStatus(
                id, 'active',
            );
        }
    }
}

async function changeUserStatus(
    userId: string,
    next: 'active' | 'deactivated',
): Promise<void> {
    try {
        const entity =
            await getUserEntity(userId);
        const { id: _id, ...rest } = entity;
        await putUser(userId, {
            ...rest,
            status: next,
        });
        showToast(
            next === 'deactivated'
                ? 'User deactivated'
                : 'User reactivated',
            'success',
        );
        navigateTo('users');
    } catch (err) {
        log.error(
            'changeUserStatus failed',
            'organization', err,
        );
        showToast(
            'Failed to update user status',
            'error',
        );
    }
}

function bindInviteDialog(): void {
    initDialog(
        'invite', 'invite-btn', handleInvite,
    );
    $('#invite-dialog', document)
        ?.addEventListener(
            'keydown', onDialogKeydown,
            { signal },
        );
}

function onDialogKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    $('#invite-submit', document)?.click();
}

async function handleInvite(): Promise<void> {
    const first = $input(
        '#invite-first', document,
    )!.value;
    const last = $input(
        '#invite-last', document,
    )!.value;
    const email = $input(
        '#invite-email', document,
    )!.value;
    if (!first || !last || !email) {
        showToast(
            'Name and email are required',
            'error',
        );
        return;
    }
    const role = $select(
        '#invite-role', document,
    )!.value;
    const dept = $select(
        '#invite-department', document,
    )!.value;
    const status = $select(
        '#invite-status', document,
    )!.value;
    const phone = $input(
        '#invite-phone', document,
    )!.value;
    const avail = Number(
        $input(
            '#invite-avail', document,
        )!.value,
    );
    const perf = Number(
        $input(
            '#invite-perf', document,
        )!.value,
    );
    const bio = document.querySelector
        <HTMLTextAreaElement>(
            '#invite-bio',
        )!.value;
    const id = crypto.randomUUID();
    try {
        await putUser(
            id,
            trimStrings({
                first_name: first,
                last_name: last,
                email,
                role,
                department: dept,
                status: status as
                    'active'
                    | 'pending'
                    | 'deactivated',
                availability: avail,
                performance_score: perf,
                projects_completed: 0,
                current_projects: 0,
                strengths:
                    jsonArrayField([]),
                team_dimensions:
                    jsonObjectField({
                        driver: DEFAULT_DIM,
                        analytical:
                            DEFAULT_DIM,
                        expressive:
                            DEFAULT_DIM,
                        amiable: DEFAULT_DIM,
                    }),
                phone,
                bio,
                last_active: nowUtc(),
            }),
        );
        await postActivity({
            type: 'user_joined',
            action: 'joined the team',
            target: first + ' ' + last,
            status: '',
            feedback: '',
        });
        showToast('User created', 'success');
        closeDialog('invite');
        navigateTo('users');
    } catch (err) {
        log.error(
            'putUser failed',
            'organization', err,
        );
        showToast(
            'Failed to create user', 'error',
        );
    }
}
