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
    iconPersonPlus, iconSearch,
    iconChevronRight, iconSend,
} from '../app/icons.ts';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    createRequestContext,
    getPeople, putPerson,
    getCurrentPerson,
    postActivity,
    jsonArrayField,
    jsonObjectField,
    generateCryptoSafeBase62,
    subscribePersonChanges,
} from '../app/adapters/index.ts';
import {
    ManagedPeoplePresenter,
    buildInitialManagedPeopleState,
    applyManagedPeopleSearch,
    applyManagedPeopleTitle,
    applyManagedPeopleStatus,
    type ManagedPeopleState,
} from '../app/presenters/index.ts';

const DEFAULT_DIM = 50;

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let peopleState:
    ManagedPeopleState | null = null;
let personListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const container = $(
        '#manage-people-content', document,
    );
    if (!container) return;

    const ctx = createRequestContext();
    const loaded = await withLoadingState(
        container,
        buildSkeleton('table', 5),
        async () => {
            const [people, currentRow] =
                await Promise.all([
                    getPeople(ctx),
                    getCurrentPerson(ctx),
                ]);
            return { people, currentRow };
        },
        init,
    );
    if (!loaded) return;

    peopleState =
        buildInitialManagedPeopleState(
            loaded.people, loaded.currentRow.id,
        );
    const initialPresenter =
        new ManagedPeoplePresenter(peopleState);
    setHtml(container, buildShellHtml(
        initialPresenter.activeCount(),
        initialPresenter.pendingCount(),
    ));

    personListEl = $('#person-list', document);
    if (personListEl) {
        rerenderPeople();
        personListEl.addEventListener(
            'click', onPersonListClick,
            { signal },
        );
    }

    subscribePersonChanges(async () => {
        if (!peopleState || !personListEl) return;
        const fresh = await getPeople(
            createRequestContext(),
        );
        peopleState =
            buildInitialManagedPeopleState(
                fresh,
                peopleState.currentPersonId,
            );
        rerenderPeople();
    });

    initPersonListFilters();
    bindInviteDialog();
}

function isMissingInviteRequiredFields(
    first: string,
    last: string,
    email: string,
): boolean {
    return !first || !last || !email;
}

function rerenderPeople(): void {
    if (!peopleState || !personListEl) return;
    new ManagedPeoplePresenter(peopleState)
        .renderList(personListEl);
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
                <a href="../organization/index.html"
                    class="text-primary">
                    Organization
                </a>
                ${iconChevronRight(14, '')}
                <span>Manage People</span>
            </nav>

            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <div>
                    <h1 class="${
                        'text-3xl font-display'
                        + ' font-bold mb-2'
                    }">Manage People</h1>
                    <p class="text-muted">
                        ${activeCount}
                        active people,
                        ${pendingCount}
                        pending invitations
                    </p>
                </div>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="invite-btn">
                    ${iconPersonPlus(16, '')}
                    Invite Person
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
                        id="person-search"
                        aria-label="${
                            'Search by name'
                            + ' or email'
                        }" />
                </div>
                <select class="${
                    'input input-narrow'
                }" id="title-filter"
                    aria-label="${
                        'Filter by title'
                    }">
                    <option value="all">
                        All Titles
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
                    }">Person</div>
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
                <div id="person-list"></div>
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
                    ${iconPersonPlus(20, '')}
                    Add Person
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
                            'person@company.com'
                        }"
                        id="invite-email" />
                </div>
                <div class="flex gap-3">
                    <div class="flex-1">
                        <label class="${
                            'label mb-1 block'
                        }">Title</label>
                        <input class="input"
                            type="text"
                            placeholder="${
                                'e.g. Engineer'
                            }"
                            id="invite-title" />
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
                    Add Person
                </button>
            </div>
        </div>`;
}

function initPersonListFilters(): void {
    $input('#person-search', document)
        ?.addEventListener(
            'input', onSearchInput,
            { signal },
        );
    $select('#title-filter', document)
        ?.addEventListener(
            'change', onTitleChange,
            { signal },
        );
    $select('#status-filter', document)
        ?.addEventListener(
            'change', onStatusChange,
            { signal },
        );
}

function onSearchInput(e: Event): void {
    if (!peopleState || !personListEl) return;
    const target =
        e.target as HTMLInputElement;
    peopleState = applyManagedPeopleSearch(
        peopleState, target.value,
    );
    rerenderPeople();
}

function onTitleChange(e: Event): void {
    if (!peopleState || !personListEl) return;
    const target =
        e.target as HTMLSelectElement;
    peopleState = applyManagedPeopleTitle(
        peopleState, target.value,
    );
    rerenderPeople();
}

function onStatusChange(e: Event): void {
    if (!peopleState || !personListEl) return;
    const target =
        e.target as HTMLSelectElement;
    peopleState = applyManagedPeopleStatus(
        peopleState, target.value,
    );
    rerenderPeople();
}

function onPersonListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const row = target.closest(
        '[data-person-id]',
    );
    if (!row) return;
    const personId = row.getAttribute(
        'data-person-id',
    );
    if (personId) {
        navigateTo(
            'people-detail', { personId },
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
    if (
        isMissingInviteRequiredFields(
            first, last, email,
        )
    ) {
        showToast(
            'Name and email are required',
            'error',
        );
        return;
    }
    const title = $input(
        '#invite-title', document,
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
    const bio = $textarea(
        '#invite-bio', document,
    )!.value;
    const id = generateCryptoSafeBase62();
    try {
        await putPerson(
            createRequestContext(),
            id,
            trimStrings({
                first_name: first,
                last_name: last,
                email,
                title,
                department: dept,
                status: status as
                    'active'
                    | 'pending'
                    | 'deactivated',
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
            }),
        );
    } catch (err) {
        log.error(
            'putPerson failed',
            'organization', err,
        );
        showToast(
            'Failed to add person', 'error',
        );
        return;
    }
    try {
        await postActivity(
            createRequestContext(),
            {
                type: 'person_joined',
                action: 'joined the team',
                target: first + ' ' + last,
                status: '',
                feedback: '',
            },
        );
    } catch (err) {
        log.error(
            'postActivity failed',
            'organization', err,
        );
        showToast(
            'Failed to add person', 'error',
        );
        return;
    }
    showToast('Person added', 'success');
    closeDialog('invite');
    navigateTo('people');
}
