import {
    $, $input, $select,
    bindEnterToClick,
} from '../app/dom';
import {
    html, setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import {
    iconUsers, iconUserPlus, iconSearch,
    iconChevronRight, iconSend,
} from '../app/icons';
import {
    initDialog, closeDialog, navigateTo,
} from '../app/core';
import {
    getManagedUsers, putUser,
} from '../app/adapters';
import {
    UserPresenter,
} from '../app/presenters';
import {
    jsonArrayField,
    jsonObjectField,
    nowUtc,
} from '../../api/types';

const DEFAULT_DIM = 50;

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

    const presenters = users.map(
        u => new UserPresenter(u),
    );
    const activeCount =
        presenters.filter(
            p => p.matchesStatusFilter(
                'active',
            ),
        ).length;
    const pendingCount =
        presenters.filter(
            p => p.matchesStatusFilter(
                'pending',
            ),
        ).length;

    setHtml(container, html`
        <div style="${
            'max-width:72rem;'
            + 'margin:0 auto'
        }">
            <nav class="${
                'flex items-center '
                + 'gap-2 text-sm '
                + 'text-muted mb-6'
            }">
                <a href="index.html"
                    class="${
                        'text-primary'
                    }">
                    Administration
                </a>
                ${iconChevronRight(14, '')}
                <span>Manage Users</span>
            </nav>

            <div class="${
                'flex items-center '
                + 'justify-between mb-6'
            }">
                <div>
                    <h1 class="${
                        'text-3xl '
                        + 'font-display '
                        + 'font-bold mb-2'
                    }">
                        Manage Users
                    </h1>
                    <p class="text-muted">
                        ${activeCount
                        } active users,
                        ${pendingCount}
                        pending invitations
                    </p>
                </div>
                <button
                    class="${
                        'btn btn-primary '
                        + 'gap-2'
                    }"
                    id="invite-btn">
                    ${iconUserPlus(16, '')
                    } Invite User
                </button>
            </div>

            <div
                class="${
                    'flex items-center '
                    + 'gap-4 mb-6'
                }">
                <div class="${
                    'search-wrapper'
                }"
                    style="${
                        'flex:1;'
                        + 'max-width:20rem'
                    }">
                    <span class="${
                        'search-icon'
                    }">
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
                <select class="input"
                    style="${
                        'width:10rem'
                    }"
                    id="role-filter"
                    aria-label="${
                        'Filter by role'
                    }">
                    <option value="all">
                        All Roles
                    </option>
                    <option value="admin">
                        Admin
                    </option>
                    <option value="${
                        'manager'
                    }">
                        Manager
                    </option>
                    <option value="${
                        'member'
                    }">
                        Member
                    </option>
                    <option value="${
                        'viewer'
                    }">
                        Viewer
                    </option>
                </select>
                <select class="input"
                    style="${
                        'width:10rem'
                    }"
                    id="status-filter"
                    aria-label="${
                        'Filter by status'
                    }">
                    <option value="all">
                        All Status
                    </option>
                    <option value="${
                        'active'
                    }">
                        Active
                    </option>
                    <option value="${
                        'pending'
                    }">
                        Pending
                    </option>
                    <option value="${
                        'deactivated'
                    }">
                        Deactivated
                    </option>
                </select>
            </div>

            <div class="card"
                style="${
                    'overflow:hidden'
                }">
                <div class="${
                    'flex items-center '
                    + 'gap-4 p-4'
                }"
                    style="${
                        'background:'
                        + 'hsl(var(--muted)'
                        + '/0.3);'
                        + 'border-bottom:'
                        + '1px solid '
                        + 'hsl(var(--border))'
                    }">
                    <div style="flex:2"
                        class="${
                            'text-xs '
                            + 'font-medium '
                            + 'text-muted'
                        }">
                        User
                    </div>
                    <div style="flex:1"
                        class="${
                            'text-xs '
                            + 'font-medium '
                            + 'text-muted'
                        }">
                        Role
                    </div>
                    <div style="flex:1"
                        class="${
                            'text-xs '
                            + 'font-medium '
                            + 'text-muted'
                        }">
                        Department
                    </div>
                    <div style="flex:1"
                        class="${
                            'text-xs '
                            + 'font-medium '
                            + 'text-muted'
                        }">
                        Status
                    </div>
                    <div
                        style="${
                            'flex:0 0 auto;'
                            + 'width:2.5rem'
                        }">
                    </div>
                </div>
                <div id="user-list">
                    ${presenters.map(
                        p => p.buildUserRow(),
                    )}
                </div>
            </div>

            <div id="${
                'invite-backdrop'
            }"
                class="${
                    'dialog-backdrop '
                    + 'hidden'
                }">
            </div>
            <div id="${
                'invite-dialog'
            }"
                class="dialog hidden"
                role="dialog"
                aria-modal="true"
                style="${
                    'max-width:36rem'
                }">
                <div class="${
                    'dialog-header'
                }">
                    <h3
                        class="${
                            'dialog-title '
                            + 'flex '
                            + 'items-center '
                            + 'gap-2'
                        }">
                        ${iconUserPlus(20, '')}
                        Add User
                    </h3>
                </div>
                <div
                    class="${
                        'flex flex-col '
                        + 'gap-3 py-4'
                    }"
                    style="${
                        'max-height:60vh;'
                        + 'overflow-y:auto'
                    }">
                    <div class="${
                        'flex gap-3'
                    }">
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                First Name
                            </label>
                            <input
                                class="input"
                                id="${
                                    'invite-'
                                    + 'first'
                                }"
                                placeholder="${
                                    'First name'
                                }" />
                        </div>
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Last Name
                            </label>
                            <input
                                class="input"
                                id="${
                                    'invite-'
                                    + 'last'
                                }"
                                placeholder="${
                                    'Last name'
                                }" />
                        </div>
                    </div>
                    <div>
                        <label
                            class="${
                                'label '
                                + 'mb-1 '
                                + 'block'
                            }">
                            Email
                        </label>
                        <input
                            class="input"
                            type="email"
                            placeholder="${
                                'user@company'
                                + '.com'
                            }"
                            id="${
                                'invite-email'
                            }" />
                    </div>
                    <div class="${
                        'flex gap-3'
                    }">
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Role
                            </label>
                            <select
                                class="input"
                                id="${
                                    'invite-'
                                    + 'role'
                                }">
                                <option
                                    value="${
                                        'member'
                                    }">
                                    Member
                                </option>
                                <option
                                    value="${
                                        'admin'
                                    }">
                                    Admin
                                </option>
                                <option
                                    value="${
                                        'manager'
                                    }">
                                    Manager
                                </option>
                                <option
                                    value="${
                                        'viewer'
                                    }">
                                    Viewer
                                </option>
                            </select>
                        </div>
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Department
                            </label>
                            <select
                                class="input"
                                id="${
                                    'invite-'
                                    + 'department'
                                }">
                                <option
                                    value="${
                                        'Engineering'
                                    }">
                                    Engineering
                                </option>
                                <option
                                    value="${
                                        'Product'
                                    }">
                                    Product
                                </option>
                                <option
                                    value="${
                                        'Design'
                                    }">
                                    Design
                                </option>
                                <option
                                    value="${
                                        'Sales'
                                    }">
                                    Sales
                                </option>
                                <option
                                    value="${
                                        'Operations'
                                    }">
                                    Operations
                                </option>
                                <option
                                    value="${
                                        'Analytics'
                                    }">
                                    Analytics
                                </option>
                            </select>
                        </div>
                    </div>
                    <div class="${
                        'flex gap-3'
                    }">
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Status
                            </label>
                            <select
                                class="input"
                                id="${
                                    'invite-'
                                    + 'status'
                                }">
                                <option
                                    value="${
                                        'active'
                                    }">
                                    Active
                                </option>
                                <option
                                    value="${
                                        'pending'
                                    }">
                                    Pending
                                </option>
                                <option
                                    value="${
                                        'deactivated'
                                    }">
                                    Deactivated
                                </option>
                            </select>
                        </div>
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Phone
                            </label>
                            <input
                                class="input"
                                id="${
                                    'invite-'
                                    + 'phone'
                                }"
                                placeholder="${
                                    '+1 (555)'
                                    + ' 000-0000'
                                }" />
                        </div>
                    </div>
                    <div class="${
                        'flex gap-3'
                    }">
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Availability %
                            </label>
                            <input
                                class="input"
                                type="number"
                                min="0"
                                max="100"
                                id="${
                                    'invite-'
                                    + 'avail'
                                }"
                                placeholder="${
                                    '0-100'
                                }" />
                        </div>
                        <div style="flex:1">
                            <label
                                class="${
                                    'label '
                                    + 'mb-1 '
                                    + 'block'
                                }">
                                Performance
                            </label>
                            <input
                                class="input"
                                type="number"
                                min="0"
                                max="100"
                                id="${
                                    'invite-'
                                    + 'perf'
                                }"
                                placeholder="${
                                    '0-100'
                                }" />
                        </div>
                    </div>
                    <div>
                        <label
                            class="${
                                'label '
                                + 'mb-1 '
                                + 'block'
                            }">
                            Bio
                        </label>
                        <textarea
                            class="textarea"
                            rows="2"
                            id="${
                                'invite-bio'
                            }"
                            placeholder="${
                                'Short bio...'
                            }"></textarea>
                    </div>
                </div>
                <div class="${
                    'dialog-footer'
                }">
                    <button class="${
                        'btn btn-outline'
                    }"
                        id="${
                            'invite-cancel'
                        }">
                        Cancel
                    </button>
                    <button
                        class="${
                            'btn '
                            + 'btn-primary '
                            + 'gap-2'
                        }"
                        id="${
                            'invite-submit'
                        }">
                        ${iconSend(16, '')
                        } Add User
                    </button>
                </div>
            </div>
        </div>`);

    const userList = $(
        '#user-list', document,
    );
    const searchInput = $input(
        '#user-search', document,
    )!;
    const roleFilter = $select(
        '#role-filter', document,
    )!;
    const statusFilter = $select(
        '#status-filter', document,
    )!;

    function filterUsers(): void {
        if (!userList) return;
        const query =
            searchInput.value
                .toLowerCase();
        const role = roleFilter.value;
        const status =
            statusFilter.value;
        const filtered =
            presenters.filter(p =>
                (!query
                    || p.matchesUserSearch(
                        query,
                    ))
                && p.matchesRoleFilter(role)
                && p.matchesStatusFilter(
                    status,
                ),
            );
        setHtml(
            userList,
            html`${filtered.map(
                p => p.buildUserRow(),
            )}`,
        );
    }

    searchInput.addEventListener(
        'input', filterUsers,
    );
    roleFilter.addEventListener(
        'change', filterUsers,
    );
    statusFilter.addEventListener(
        'change', filterUsers,
    );

    initDialog('invite', 'invite-btn',
        async () => {
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
                    'Name and email'
                    + ' are required',
                    'error',
                );
                return;
            }
            const role = $select(
                '#invite-role', document,
            )!.value;
            const dept = $select(
                '#invite-department',
                document,
            )!.value;
            const status = $select(
                '#invite-status',
                document,
            )!.value;
            const phone = $input(
                '#invite-phone', document,
            )!.value;
            const avail = Number(
                $input(
                    '#invite-avail',
                    document,
                )!.value,
            );
            const perf = Number(
                $input(
                    '#invite-perf',
                    document,
                )!.value,
            );
            const bio =
                document.querySelector<
                    HTMLTextAreaElement
                >('#invite-bio')!.value;
            const id = crypto.randomUUID();
            try {
                await putUser(id, {
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
                    performance_score:
                        perf,
                    projects_completed: 0,
                    current_projects: 0,
                    strengths:
                        jsonArrayField([]),
                    team_dimensions:
                        jsonObjectField({
                            driver:
                                DEFAULT_DIM,
                            analytical:
                                DEFAULT_DIM,
                            expressive:
                                DEFAULT_DIM,
                            amiable:
                                DEFAULT_DIM,
                        }),
                    phone,
                    bio,
                    last_active: nowUtc(),
                });
                showToast(
                    'User created',
                    'success',
                );
                closeDialog('invite');
                navigateTo('users');
            } catch {
                showToast(
                    'Failed to create'
                    + ' user',
                    'error',
                );
            }
        },
    );

    const submitSel = '#invite-submit';
    bindEnterToClick(
        '#invite-first', submitSel,
    );
    bindEnterToClick(
        '#invite-last', submitSel,
    );
    bindEnterToClick(
        '#invite-email', submitSel,
    );
    bindEnterToClick(
        '#invite-phone', submitSel,
    );
    bindEnterToClick(
        '#invite-avail', submitSel,
    );
    bindEnterToClick(
        '#invite-perf', submitSel,
    );
}
