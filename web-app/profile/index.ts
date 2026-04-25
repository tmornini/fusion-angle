import { $ } from '../app/dom';
import {
    ProfilePresenter,
    type ProfileFieldKey,
} from '../app/presenters';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import { trimStrings } from '../app/core';
import {
    getProfile,
    putProfile,
    type Profile,
} from '../app/adapters';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let presenter: ProfilePresenter | null = null;
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

export async function init(): Promise<void> {
    const container = $(
        '#profile-content', document,
    );
    if (!container) return;
    pageContainer = container;

    let profile: Profile;
    try {
        profile = await getProfile();
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

    presenter = new ProfilePresenter(profile);
    presenter.renderShell(container);
    bindStableListeners(container, presenter);
}

function bindStableListeners(
    container: HTMLElement,
    p: ProfilePresenter,
): void {
    container.addEventListener(
        'click', e => onClick(e, container, p),
        { signal },
    );
    container.addEventListener(
        'input', e => onInput(e, p),
        { signal },
    );
    container.addEventListener(
        'change', e => onInput(e, p),
        { signal },
    );
    container.addEventListener(
        'keydown',
        e => onContainerKeydown(e),
        { signal },
    );
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(
            e, container, p,
        ),
        { signal },
    );
}

function onClick(
    e: MouseEvent,
    container: HTMLElement,
    p: ProfilePresenter,
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
        p.beginEdit();
        p.renderUpdate(container);
        return;
    }
    if (action === 'cancel') {
        p.cancelEdit();
        p.renderUpdate(container);
        return;
    }
    if (action === 'save') {
        void handleSave();
        return;
    }

    const chip = target.closest(
        '.strength-chip',
    );
    if (chip && p.isEditing()) {
        const name = chip.getAttribute(
            'data-strength',
        );
        if (name) {
            p.toggleStrength(name);
            p.renderUpdate(container);
        }
    }
}

function onInput(
    e: Event,
    p: ProfilePresenter,
): void {
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
    p.setDraftField(field, target.value);
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
    container: HTMLElement,
    p: ProfilePresenter,
): void {
    if (e.key !== 'Escape') return;
    if (!p.isEditing()) return;
    e.preventDefault();
    p.cancelEdit();
    p.renderUpdate(container);
}

async function handleSave(): Promise<void> {
    if (!presenter || !pageContainer) return;
    if (!presenter.isEditing()) return;
    const updated = trimStrings(
        presenter.draft(),
    );
    try {
        await putProfile(updated);
    } catch (err) {
        log.error(
            'putProfile failed',
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
    presenter.update(updated);
    presenter.renderUpdate(pageContainer);
}
