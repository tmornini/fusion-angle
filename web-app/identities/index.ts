import {
    $, $$, $input, $required, $textarea,
    populateIcons,
} from '../app/dom.ts';
import { showToast } from '../app/toast.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { reportFault } from '../app/error-helpers.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import {
    ICON_SIZE,
    iconPersonPlus, iconSend,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { trimStrings } from '../app/format.ts';
import {
    handleDialogClick, closeDialog,
} from '../app/dialog.ts';
import {
    sessionContext,
    getIdentityRoster,
    postIdentityCreation,
    subscribeIdentityChanges,
    generateIdentifier,
    IdentityPiiIntakeFailedError,
    type IdentityRosterRow,
    type RequestContext,
} from '../app/adapters/index.ts';
import {
    IdentityRosterPresenter,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

let identityListEl: HTMLElement | null = null;

// Mint-once discipline (Phase 10 Task 2): the Add Identity
// dialog mints its entity id ONCE per dialog session and reuses
// it across retries — a retry after a partial (second-hop PII
// PUT) failure re-submits against the SAME identity rather than
// minting a fresh one and orphaning the first. Reset whenever
// the dialog opens (bindAddIdentityDialog), so a later session
// never reuses a stale id from an abandoned earlier one.
let pendingIdentityId: string | null = null;

function currentIdentityId(): string {
    pendingIdentityId ??= generateIdentifier();
    return pendingIdentityId;
}

export async function init(): Promise<void> {
    const list = $required(
        '#identity-list', document,
    );

    populateIcons([
        ['#add-identity-btn-icon', iconPersonPlus(ICON_SIZE.base, '')],
        ['#add-identity-dialog-icon', iconPersonPlus(ICON_SIZE.xl, '')],
        ['#add-identity-submit-icon', iconSend(ICON_SIZE.base, '')],
    ]);
    bindAddIdentityDialog();
    // One delegate opens, cancels, and light-dismisses the add
    // dialog through data-dialog-open / data-dialog-cancel — one
    // voice with every other dialog surface.
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

    const ctx = sessionContext();
    await loadInto({
        container: list,
        skeleton: buildSkeleton('table', 5),
        fetch: () => getIdentityRoster(ctx),
        retry: init,
        onData: roster => {
            identityListEl = list;
            renderRoster(roster);
            identityListEl.addEventListener(
                'click', onListClick,
                { signal },
            );
            subscribeIdentityChanges(
                () => void refresh(
                    sessionContext(),
                ),
            );
        },
    });
}

function renderRoster(
    roster: IdentityRosterRow[],
): void {
    if (!identityListEl) return;
    new IdentityRosterPresenter(roster)
        .render(identityListEl);
}

async function refresh(
    ctx: RequestContext,
): Promise<void> {
    if (!identityListEl) return;
    const roster = await getIdentityRoster(ctx);
    renderRoster(roster);
}

function onListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Real links navigate themselves; the
    // delegate must not double-fire.
    if (target.closest('a[href]')) return;
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
    $required('#add-identity-submit', document)
        .addEventListener(
            'click',
            () => void handleAddIdentitySubmit(),
            { signal },
        );
    $$(
        '#add-identity-kind-toggle input', document,
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
    // A fresh dialog session gets a fresh id (mint-once
    // discipline above) — mirrors bindInviteMemberDialog's own
    // reset-on-open pattern for its field error.
    $required('#add-identity-btn', document)
        .addEventListener(
            'click',
            () => {
                pendingIdentityId = null;
                clearAddIdentityFields();
            },
            { signal },
        );
}

// The dialog's inputs are static markup, so a cancelled,
// escaped, or submitted session would greet the next one with
// last time's text. Open is the one path all three share.
function clearAddIdentityFields(): void {
    $input('#id-name', document)!.value = '';
    $input('#id-email', document)!.value = '';
    $input('#id-phone', document)!.value = '';
    $textarea('#id-bio', document)!.value = '';
    $input('#svc-secret', document)!.value = '';
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
    const checked = $input(
        '#add-identity-kind-toggle'
        + ' input[name="identity-kind"]:checked',
        document,
    );
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
    const id = currentIdentityId();
    const ctx = sessionContext();
    try {
        await postIdentityCreation(
            ctx,
            id,
            {
                kind: 'person',
                pii: trimStrings({
                    name, email, phone, bio,
                }),
            },
        );
    } catch (err) {
        if (err instanceof IdentityPiiIntakeFailedError) {
            reportFault(
                ctx,
                'Identity created, but its contact'
                + ' details failed to save',
                err,
            );
        } else {
            reportFault(
                ctx, 'Failed to add identity', err,
            );
        }
        return;
    }
    showToast('Identity added', 'success');
    closeDialog('add-identity');
    void refresh(ctx);
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
    const id = currentIdentityId();
    const ctx = sessionContext();
    try {
        await postIdentityCreation(
            ctx,
            id,
            { kind: 'service', secret },
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add identity', err,
        );
        return;
    }
    showToast('Service identity added', 'success');
    closeDialog('add-identity');
    void refresh(ctx);
}
