import {
    $, $input, $select, $textarea,
    populateIcons,
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
    iconSend,
} from '../app/icons.ts';
import {
    initDialog, closeDialog,
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    sessionContext,
    getMembers,
    postHumanMemberCreation,
    postAIMemberCreation,
    getCurrentHumanMember,
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

const pageAbort = new AbortController();
const signal = pageAbort.signal;

let membersState:
    ManagedMembersState | null = null;
let memberListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const memberList = $('#member-list', document);
    if (!memberList) return;

    populateIcons([
        ['#add-member-btn-icon', iconPersonPlus(16, '')],
        ['#member-search-icon', iconSearch(16, '')],
        ['#add-member-dialog-icon', iconPersonPlus(20, '')],
        ['#add-member-submit-icon', iconSend(16, '')],
    ]);
    initMemberListFilters();
    bindAddMemberDialog();
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
    const loaded = await withLoadingState(
        memberList,
        buildSkeleton('table', 5),
        async () => {
            const [members, currentRow] =
                await Promise.all([
                    getMembers(ctx),
                    getCurrentHumanMember(ctx),
                ]);
            return { members, currentRow };
        },
        init,
    );
    if (!loaded) return;

    membersState =
        buildInitialManagedMembersState(
            loaded.members, loaded.currentRow.id,
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
    $input('#member-search', document)
        ?.addEventListener(
            'input', onSearchInput,
            { signal },
        );
    document.querySelectorAll<HTMLElement>(
        '[data-kind-chip]',
    ).forEach(chip => {
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
    document.querySelectorAll<HTMLElement>(
        '[data-kind-chip]',
    ).forEach(chip => {
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
    initDialog(
        'add-member',
        'add-member-btn',
        handleAddMemberSubmit,
    );
    document.querySelectorAll<HTMLInputElement>(
        '#add-member-kind-toggle input',
    ).forEach(input => {
        input.addEventListener(
            'change', onKindRadioChange,
            { signal },
        );
    });
    $('#add-member-dialog', document)
        ?.addEventListener(
            'keydown', onDialogKeydown,
            { signal },
        );
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
    const checked = document.querySelector<
        HTMLInputElement
    >('#add-member-kind-toggle'
        + ' input[name="member-kind"]:checked');
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
    try {
        await postHumanMemberCreation(
            sessionContext(),
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
        const detail = err instanceof Error
            ? err.message
            : String(err);
        log.error(
            'postHumanMemberCreation failed',
            'members', err,
        );
        showToast(
            `Failed to add member: ${detail}`,
            'error',
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
    try {
        await postAIMemberCreation(
            sessionContext(),
            id,
            trimStrings({
                name,
                description,
                skill_focus: skillFocus,
                model,
            }),
        );
    } catch (err) {
        log.error(
            'postAIMemberCreation failed',
            'members', err,
        );
        showToast(
            'Failed to add AI member',
            'error',
        );
        return;
    }
    showToast('AI member added', 'success');
    closeDialog('add-member');
    navigateTo('members');
}
