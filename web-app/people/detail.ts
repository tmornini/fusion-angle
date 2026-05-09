import {
    $, $select, isFormField,
} from '../app/dom.ts';
import {
    PersonDetailPresenter,
    PersonDetailEditPresenter,
    buildPersonRolesSection,
    personDraftFromPerson,
    personPatchFromDraft,
    isPersonFieldKey,
    type PersonDraftFields,
} from '../app/presenters/index.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    navigateTo,
    trimStrings,
} from '../app/core.ts';
import {
    createRequestContext,
    getPerson,
    getPersonRow,
    putPerson,
    subscribePersonChanges,
    getRoles,
    getMembersForPerson,
    addMember,
    removeMember,
    subscribeRoleChanges,
    subscribeMembershipChanges,
    userPrivateRoleFor,
    isUserPrivateRoleId,
    type Person,
    type PersonStatus,
} from '../app/adapters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        person: Person;
    }
    | {
        kind: 'editing';
        person: Person;
        draft: PersonDraftFields;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

function buildPresenter():
    | PersonDetailPresenter
    | PersonDetailEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new PersonDetailPresenter(state.person)
        : new PersonDetailEditPresenter(
            state.person, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const personId = params?.personId;
    if (!personId) {
        navigateTo('people');
        return;
    }

    const container = $(
        '#person-detail-content', document,
    );
    if (!container) return;
    pageContainer = container;

    const ctx = createRequestContext();
    const person = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => getPerson(ctx, personId),
        () => init(params),
    );
    if (!person) return;

    state = { kind: 'reading', person };
    buildPresenter().renderShell(container);
    bindStableListeners(container);

    void renderRolesSection(personId);

    subscribePersonChanges(async () => {
        if (!pageContainer || !state) return;
        const fresh = await getPerson(
            createRequestContext(), personId,
        );
        state = { kind: 'reading', person: fresh };
        rerender();
    });

    subscribeMembershipChanges(() => {
        void renderRolesSection(personId);
    });
    subscribeRoleChanges(() => {
        void renderRolesSection(personId);
    });
}

async function renderRolesSection(
    personId: string,
): Promise<void> {
    if (!pageContainer || !state) return;
    const slot = pageContainer.querySelector(
        '.person-roles-slot',
    );
    if (!(slot instanceof HTMLElement)) return;
    const ctx = createRequestContext();
    const [members, roles] = await Promise.all([
        getMembersForPerson(ctx, personId),
        getRoles(ctx),
    ]);
    const memberRoleIds = new Set(
        members.map(m => m.role.idForLink()),
    );
    const availableRoles = roles.filter(
        r => !isUserPrivateRoleId(
            r.idForLink(),
        ) && !memberRoleIds.has(
            r.idForLink(),
        ),
    );
    const userPrivateRole = state.person
        .isDeactivated()
        ? null
        : userPrivateRoleFor(state.person);
    setHtml(
        slot,
        buildPersonRolesSection(
            members,
            userPrivateRole,
            availableRoles,
        ),
    );
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
        'change', e => onInput(e),
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

    const roleActionEl = target.closest(
        '[data-role-action]',
    );
    const roleAction = roleActionEl?.getAttribute(
        'data-role-action',
    );
    if (roleAction === 'add') {
        void handleAddToRole();
        return;
    }
    if (roleAction === 'remove') {
        const membershipId = roleActionEl
            ?.getAttribute(
                'data-membership-id',
            );
        if (membershipId) {
            void handleRemoveFromRole(
                membershipId,
            );
        }
        return;
    }

    const actionEl = target.closest(
        '[data-person-action]',
    );
    const action = actionEl?.getAttribute(
        'data-person-action',
    );
    if (action === 'back') {
        navigateTo('people');
        return;
    }
    if (action === 'edit') {
        if (!state || state.kind !== 'reading') {
            return;
        }
        state = {
            kind: 'editing',
            person: state.person,
            draft: personDraftFromPerson(
                state.person,
            ),
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
            person: state.person,
        };
        rerender();
        return;
    }
    if (action === 'save') {
        void handleSave();
        return;
    }

    const chip = target.closest(
        '.strength-chip',
    );
    if (
        chip
        && state
        && state.kind === 'editing'
    ) {
        const name = chip.getAttribute(
            'data-strength',
        );
        if (name) {
            const cur = state.draft.strengths;
            const i = cur.indexOf(name);
            const next = i >= 0
                ? cur.filter(
                    (_, idx) => idx !== i,
                )
                : [...cur, name];
            state = {
                ...state,
                draft: {
                    ...state.draft,
                    strengths: next,
                },
            };
            rerender();
        }
    }
}

function onInput(e: Event): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target;
    if (!isFormField(target)) return;
    const field = target.getAttribute(
        'data-person-field',
    );
    if (!isPersonFieldKey(field)) return;
    if (field === 'status') {
        state = {
            ...state,
            draft: {
                ...state.draft,
                status: target.value as PersonStatus,
            },
        };
        return;
    }
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
        person: state.person,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const personId = state.person.idForLink();
    const ctx = createRequestContext();
    let row;
    try {
        row = await getPersonRow(ctx, personId);
    } catch (err) {
        log.error(
            'getPersonRow failed',
            'people', err,
        );
        showToast(
            'Failed to save person', 'error',
        );
        return;
    }
    const patch = trimStrings(
        personPatchFromDraft(state.draft),
    );
    const { id: _id, ...rest } = row;
    try {
        await putPerson(ctx, personId, {
            ...rest, ...patch,
        });
    } catch (err) {
        log.error(
            'putPerson failed',
            'people', err,
        );
        showToast(
            'Failed to save person', 'error',
        );
        return;
    }
    showToast('Person saved', 'success');
}

async function handleAddToRole(): Promise<void> {
    if (!state) return;
    const personId = state.person.idForLink();
    const select = $select(
        '#person-add-role-select', document,
    );
    if (!select) return;
    const roleId = select.value;
    if (!roleId) return;
    try {
        await addMember(
            createRequestContext(),
            roleId, personId,
        );
        showToast('Added to role', 'success');
    } catch (err) {
        log.error(
            'addMember failed',
            'people', err,
        );
        showToast(
            'Failed to add to role', 'error',
        );
    }
}

async function handleRemoveFromRole(
    membershipId: string,
): Promise<void> {
    try {
        await removeMember(
            createRequestContext(), membershipId,
        );
        showToast(
            'Removed from role', 'success',
        );
    } catch (err) {
        log.error(
            'removeMember failed',
            'people', err,
        );
        showToast(
            'Failed to remove from role', 'error',
        );
    }
}
