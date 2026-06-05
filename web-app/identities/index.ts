import {
    $, $input, $textarea,
    populateIcons,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    iconPersonPlus, iconSend,
} from '../app/icons.ts';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    sessionContext,
    getIdentityRoster,
    postIdentityCreation,
    generateCryptoSafeBase62,
    type IdentityRosterRow,
} from '../app/adapters/index.ts';
import {
    IdentityRosterPresenter,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let identityListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const list = $('#identity-list', document);
    if (!list) return;

    populateIcons([
        ['#add-identity-btn-icon', iconPersonPlus(16, '')],
        ['#add-identity-dialog-icon', iconPersonPlus(20, '')],
        ['#add-identity-submit-icon', iconSend(16, '')],
    ]);
    bindAddIdentityDialog();

    const ctx = sessionContext();
    const roster = await withLoadingState(
        list,
        buildSkeleton('table', 5),
        () => getIdentityRoster(ctx),
        init,
    );
    if (!roster) return;

    identityListEl = list;
    renderRoster(roster);
    identityListEl.addEventListener(
        'click', onListClick,
        { signal },
    );
}

function renderRoster(
    roster: IdentityRosterRow[],
): void {
    if (!identityListEl) return;
    new IdentityRosterPresenter(roster)
        .render(identityListEl);
}

async function refresh(): Promise<void> {
    if (!identityListEl) return;
    const roster = await getIdentityRoster(
        sessionContext(),
    );
    renderRoster(roster);
}

function onListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const row = target.closest('[data-identity-id]');
    if (!row) return;
    const identityId = row.getAttribute(
        'data-identity-id',
    );
    if (identityId) {
        navigateTo('identity-detail', { identityId });
    }
}

function bindAddIdentityDialog(): void {
    initDialog(
        'add-identity',
        'add-identity-btn',
        handleAddIdentitySubmit,
    );
    document.querySelectorAll<HTMLInputElement>(
        '#add-identity-kind-toggle input',
    ).forEach(input => {
        input.addEventListener(
            'change', onKindRadioChange,
            { signal },
        );
    });
    $('#add-identity-dialog', document)
        ?.addEventListener(
            'keydown', onDialogKeydown,
            { signal },
        );
}

function onKindRadioChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    const kind = target.value;
    const personForm = $(
        '#add-identity-person-form', document,
    );
    const serviceForm = $(
        '#add-identity-service-form', document,
    );
    if (!personForm || !serviceForm) return;
    if (kind === 'person') {
        personForm.classList.remove('hidden');
        serviceForm.classList.add('hidden');
    } else {
        personForm.classList.add('hidden');
        serviceForm.classList.remove('hidden');
    }
}

function onDialogKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    $('#add-identity-submit', document)?.click();
}

function selectedKind(): 'person' | 'service' {
    const checked = document.querySelector<
        HTMLInputElement
    >('#add-identity-kind-toggle'
        + ' input[name="identity-kind"]:checked');
    if (checked && checked.value === 'service') {
        return 'service';
    }
    return 'person';
}

async function handleAddIdentitySubmit(
): Promise<void> {
    const kind = selectedKind();
    if (kind === 'person') {
        await submitPersonForm();
    } else {
        await submitServiceForm();
    }
}

async function submitPersonForm(): Promise<void> {
    const name = $input('#id-name', document)!.value;
    const email = $input('#id-email', document)!.value;
    if (!name || !email) {
        showToast(
            'Name and email are required', 'error',
        );
        return;
    }
    const phone = $input('#id-phone', document)!.value;
    const bio = $textarea('#id-bio', document)!.value;
    const id = generateCryptoSafeBase62();
    try {
        await postIdentityCreation(
            sessionContext(),
            id,
            {
                kind: 'person',
                pii: trimStrings({
                    name, email, phone, bio,
                }),
            },
        );
    } catch (err) {
        const detail = err instanceof Error
            ? err.message
            : String(err);
        log.error(
            'postIdentityCreation person failed',
            'identities', err,
        );
        showToast(
            `Failed to add identity: ${detail}`,
            'error',
        );
        return;
    }
    showToast('Identity added', 'success');
    closeDialog('add-identity');
    void refresh();
}

async function submitServiceForm(): Promise<void> {
    const secret = $input(
        '#svc-secret', document,
    )!.value.trim();
    if (secret === '') {
        showToast(
            'A client secret is required', 'error',
        );
        return;
    }
    const id = generateCryptoSafeBase62();
    try {
        await postIdentityCreation(
            sessionContext(),
            id,
            { kind: 'service', secret },
        );
    } catch (err) {
        const detail = err instanceof Error
            ? err.message
            : String(err);
        log.error(
            'postIdentityCreation service failed',
            'identities', err,
        );
        showToast(
            `Failed to add identity: ${detail}`,
            'error',
        );
        return;
    }
    showToast('Service identity added', 'success');
    closeDialog('add-identity');
    void refresh();
}
