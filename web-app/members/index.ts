import {
    $, $$, $input, $inputRequired, $required,
    $select, $textarea,
    populateIcons,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    extractErrorMessage,
    reportFault,
} from '../app/error-helpers.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    ICON_SIZE,
    iconPersonPlus, iconSearch,
    iconSend, iconMail,
} from '../app/icons.ts';
import {
    handleDialogClick, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    sessionContext,
    getMembers,
    postHumanMemberCreation,
    postAIMemberCreation,
    getCurrentHumanMember,
    postInvitationGrant,
    type InvitationGrantOutcome,
    jsonArrayField,
    jsonObjectField,
    generateCryptoSafeBase62,
    subscribeHumanMemberChanges,
    subscribeAIMemberChanges,
} from '../app/adapters/index.ts';
import {
    ManagedMembersPresenter,
    buildInitialManagedMembersState,
    applyManagedMembersSearch,
    applyManagedMembersKind,
    buildModelOptgroups,
    type ManagedMembersState,
    type MemberKindFilter,
} from '../app/presenters/index.ts';

const DEFAULT_DIM = 50;

const { signal } = createPageAbort();

let membersState:
    ManagedMembersState | null = null;
let memberListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const memberList = $required(
        '#member-list', document,
    );

    populateIcons([
        ['#add-member-btn-icon', iconPersonPlus(ICON_SIZE.base, '')],
        ['#member-search-icon', iconSearch(ICON_SIZE.base, '')],
        ['#add-member-dialog-icon', iconPersonPlus(ICON_SIZE.xl, '')],
        ['#add-member-submit-icon', iconSend(ICON_SIZE.base, '')],
        ['#invite-member-btn-icon', iconMail(ICON_SIZE.base, '')],
        ['#invite-member-dialog-icon', iconMail(ICON_SIZE.xl, '')],
        ['#invite-member-submit-icon', iconSend(ICON_SIZE.base, '')],
    ]);
    initMemberListFilters();
    bindAddMemberDialog();
    bindInviteMemberDialog();
    // One delegate opens, cancels, and light-dismisses both
    // member dialogs through data-dialog-open / data-dialog-cancel
    // — one voice with every other dialog surface.
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
    const modelSelect = $select('#ai-model', document);
    if (modelSelect) {
        setHtml(
            modelSelect,
            html`<option value="" disabled selected
                >Select a model…</option>${
                buildModelOptgroups('')
            }`,
        );
    }

    const ctx = sessionContext();
    await loadInto({
        container: memberList,
        skeleton: buildSkeleton('table', 5),
        fetch: async () => {
            const [members, currentRow] =
                await Promise.all([
                    getMembers(ctx),
                    getCurrentHumanMember(ctx),
                ]);
            return { members, currentRow };
        },
        retry: init,
        onData: loaded => {
            membersState =
                buildInitialManagedMembersState(
                    loaded.members,
                    loaded.currentRow.id,
                );

            memberListEl = memberList;
            rerenderMembers();
            memberListEl.addEventListener(
                'click', onMemberListClick,
                { signal },
            );

            subscribeHumanMemberChanges(
                () => void refresh(),
            );
            subscribeAIMemberChanges(
                () => void refresh(),
            );
        },
    });
}

async function refresh(): Promise<void> {
    if (!membersState || !memberListEl) return;
    const fresh = await getMembers(
        sessionContext(),
    );
    membersState =
        buildInitialManagedMembersState(
            fresh,
            membersState.currentMemberId,
        );
    rerenderMembers();
}

function rerenderMembers(): void {
    if (!membersState || !memberListEl) return;
    new ManagedMembersPresenter(membersState)
        .renderList(memberListEl);
}

function initMemberListFilters(): void {
    $inputRequired('#member-search', document)
        .addEventListener(
            'input', onSearchInput,
            { signal },
        );
    $$('[data-kind-chip]', document).forEach(chip => {
        chip.addEventListener(
            'click', onKindChipClick,
            { signal },
        );
    });
}

function onSearchInput(e: Event): void {
    if (!membersState || !memberListEl) return;
    const target =
        e.target as HTMLInputElement;
    membersState = applyManagedMembersSearch(
        membersState, target.value,
    );
    rerenderMembers();
}

function onKindChipClick(e: Event): void {
    if (!membersState || !memberListEl) return;
    const target = e.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const kind = target.getAttribute(
        'data-kind-chip',
    );
    if (
        kind !== 'all'
        && kind !== 'human'
        && kind !== 'ai'
    ) return;
    membersState = applyManagedMembersKind(
        membersState, kind as MemberKindFilter,
    );
    $$('[data-kind-chip]', document).forEach(chip => {
        chip.setAttribute(
            'aria-pressed',
            chip.getAttribute('data-kind-chip')
                === kind ? 'true' : 'false',
        );
    });
    rerenderMembers();
}

function onMemberListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Real links navigate themselves; the
    // delegate must not double-fire.
    if (target.closest('a[href]')) return;
    const row = target.closest(
        '[data-member-id]',
    );
    if (!row) return;
    const memberId = row.getAttribute(
        'data-member-id',
    );
    if (memberId) {
        navigateTo(
            'member-detail', { memberId },
        );
    }
}

function bindAddMemberDialog(): void {
    $required('#add-member-submit', document)
        .addEventListener(
            'click',
            () => void handleAddMemberSubmit(),
            { signal },
        );
    $$(
        '#add-member-kind-toggle input', document,
    ).forEach(input => {
        input.addEventListener(
            'change', onKindRadioChange,
            { signal },
        );
    });
    $required('#add-member-dialog', document)
        .addEventListener(
            'keydown', onDialogKeydown,
            { signal },
        );
}

function bindInviteMemberDialog(): void {
    $required('#invite-member-submit', document)
        .addEventListener(
            'click',
            () => void handleInviteSubmit(),
            { signal },
        );
    // Clear a stale field error when the dialog reopens, so a
    // prior rejection does not greet the next invite.
    $required('#invite-member-btn', document)
        .addEventListener(
        'click',
        () => {
            const input = $input('#invite-email', document);
            if (input) setInviteEmailError(input, null);
        },
        { signal },
    );
}

// Show (message) or clear (null) the invite dialog's inline
// field error, mirroring the auth form's field-error pattern:
// the input flags `input-error` and the message lives in its own
// element — kept open so the admin can correct the address.
function setInviteEmailError(
    input: HTMLInputElement,
    message: string | null,
): void {
    const el = $('#invite-email-error', document);
    if (message === null) {
        input.classList.remove('input-error');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
        return;
    }
    input.classList.add('input-error');
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
}

async function handleInviteSubmit(): Promise<void> {
    const input = $input('#invite-email', document)!;
    setInviteEmailError(input, null);
    const email = input.value.trim();
    if (!email) {
        showToast('Email is required', 'error');
        return;
    }
    let outcome: InvitationGrantOutcome;
    try {
        outcome = await postInvitationGrant(
            sessionContext(), email,
        );
    } catch (err) {
        // An unexpected fault — the server's expected 404 / 409
        // come back as outcomes below, never as a throw.
        log.error(
            'postInvitationGrant failed',
            'members', err,
        );
        showToast(
            `Failed to invite: ${extractErrorMessage(err)}`,
            'error',
        );
        return;
    }
    if (outcome === 'no-identity') {
        setInviteEmailError(
            input, 'No identity found for that email.',
        );
        return;
    }
    if (outcome === 'already-member') {
        setInviteEmailError(
            input, 'Already a member of this organization.',
        );
        return;
    }
    showToast('Invitation sent', 'success');
    input.value = '';
    closeDialog('invite-member');
}

function onKindRadioChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    const kind = target.value;
    const humanForm = $(
        '#add-member-human-form', document,
    );
    const aiForm = $(
        '#add-member-ai-form', document,
    );
    if (!humanForm || !aiForm) return;
    if (kind === 'human') {
        humanForm.classList.remove('hidden');
        aiForm.classList.add('hidden');
    } else {
        humanForm.classList.add('hidden');
        aiForm.classList.remove('hidden');
    }
}

function onDialogKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    $('#add-member-submit', document)?.click();
}

function selectedKind(): 'human' | 'ai' {
    const checked = $input(
        '#add-member-kind-toggle'
        + ' input[name="member-kind"]:checked',
        document,
    );
    if (checked && checked.value === 'ai') {
        return 'ai';
    }
    return 'human';
}

async function handleAddMemberSubmit(
): Promise<void> {
    const kind = selectedKind();
    if (kind === 'human') {
        await submitHumanForm();
    } else {
        await submitAIForm();
    }
}

async function submitHumanForm(): Promise<void> {
    const name = $input(
        '#hw-name', document,
    )!.value;
    const email = $input(
        '#hw-email', document,
    )!.value;
    if (!name || !email) {
        showToast(
            'Name and email are required',
            'error',
        );
        return;
    }
    const title = $input(
        '#hw-title', document,
    )!.value;
    const dept = $select(
        '#hw-department', document,
    )!.value;
    const phone = $input(
        '#hw-phone', document,
    )!.value;
    const bio = $textarea(
        '#hw-bio', document,
    )!.value;
    const id = generateCryptoSafeBase62();
    const ctx = sessionContext();
    try {
        await postHumanMemberCreation(
            ctx,
            id,
            trimStrings({
                name,
                email,
                title,
                department: dept,
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
            'active',
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add member', err,
        );
        return;
    }
    showToast('Member added', 'success');
    closeDialog('add-member');
    navigateTo('members');
}

async function submitAIForm(): Promise<void> {
    const name = $input(
        '#ai-name', document,
    )!.value;
    const description = $textarea(
        '#ai-description', document,
    )!.value;
    const skillFocus = $textarea(
        '#ai-skill-focus', document,
    )!.value;
    const model = $select(
        '#ai-model', document,
    )!.value;
    if (!name) {
        showToast(
            'Name is required',
            'error',
        );
        return;
    }
    if (!model) {
        showToast(
            'Model is required',
            'error',
        );
        return;
    }
    const id = generateCryptoSafeBase62();
    const ctx = sessionContext();
    try {
        await postAIMemberCreation(
            ctx,
            id,
            trimStrings({
                name,
                description,
                skill_focus: skillFocus,
                model,
            }),
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add AI member', err,
        );
        return;
    }
    showToast('AI member added', 'success');
    closeDialog('add-member');
    navigateTo('members');
}
