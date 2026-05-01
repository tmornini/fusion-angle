import { $ } from '../app/dom.ts';
import {
    ProfilePresenter,
    ProfileEditPresenter,
    type ProfileFieldKey,
} from '../app/presenters/index.ts';
import { setHtml } from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import {
    buildErrorState,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import { trimStrings } from '../app/core.ts';
import {
    createFetchContext,
    getProfile,
    putUser,
    Profile,
    type ProfileDraft,
    type UserEntity,
    jsonArrayField,
} from '../app/adapters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        profile: Profile;
        entity: UserEntity;
    }
    | {
        kind: 'editing';
        profile: Profile;
        entity: UserEntity;
        draft: ProfileDraft;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<ProfileFieldKey> =
    new Set([
        'firstName', 'lastName', 'email',
        'phone', 'role', 'department', 'bio',
    ]);

function isFieldKey(
    s: string | null,
): s is ProfileFieldKey {
    return s !== null
        && FIELDS.has(s as ProfileFieldKey);
}

function buildPresenter():
    ProfilePresenter | ProfileEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new ProfilePresenter(state.profile)
        : new ProfileEditPresenter(
            state.profile, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

export async function init(): Promise<void> {
    const container = $(
        '#profile-content', document,
    );
    if (!container) return;
    pageContainer = container;

    let loaded: {
        profile: Profile;
        entity: UserEntity;
    };
    try {
        loaded = await getProfile(
            createFetchContext(),
        );
    } catch (err) {
        log.error(
            'getProfile failed',
            'profile',
            err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load profile.',
                'Try Again',
            ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                'click',
                () => init(),
                { signal },
            );
        return;
    }

    state = {
        kind: 'reading',
        profile: loaded.profile,
        entity: loaded.entity,
    };
    buildPresenter().renderShell(container);
    bindStableListeners(container);
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

function onClick(
    e: MouseEvent,
): void {
    const target = e.target as Element | null;
    if (!target) return;

    const actionEl = target.closest(
        '[data-profile-action]',
    );
    const action = actionEl?.getAttribute(
        'data-profile-action',
    );
    if (action === 'edit') {
        if (
            !state
            || state.kind !== 'reading'
        ) return;
        state = {
            kind: 'editing',
            profile: state.profile,
            entity: state.entity,
            draft: state.profile.toDraft(),
        };
        rerender();
        return;
    }
    if (action === 'cancel') {
        if (
            !state
            || state.kind !== 'editing'
        ) return;
        state = {
            kind: 'reading',
            profile: state.profile,
            entity: state.entity,
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
            const cur =
                state.draft.strengths;
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

function onInput(
    e: Event,
): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target as
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-profile-field',
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
        profile: state.profile,
        entity: state.entity,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const trimmed = trimStrings(state.draft);
    const current = state.entity;
    const updated: Omit<UserEntity, 'id'> = {
        ...current,
        first_name: trimmed.firstName,
        last_name: trimmed.lastName,
        email: trimmed.email,
        phone: trimmed.phone,
        role: trimmed.role,
        department: trimmed.department,
        bio: trimmed.bio,
        strengths: jsonArrayField(
            trimmed.strengths,
        ),
    };
    try {
        const ctx = createFetchContext();
        await putUser(
            ctx, current.id, updated,
        );
    } catch (err) {
        log.error(
            'profile save failed',
            'profile',
            err,
        );
        showToast(
            'Failed to save profile',
            'error',
        );
        return;
    }
    showToast('Profile saved', 'success');
    state = {
        kind: 'reading',
        profile: new Profile(trimmed),
        entity: { ...current, ...updated },
    };
    rerender();
}
