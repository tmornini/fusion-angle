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
import { reportFault } from '../app/error-helpers.ts';
import { extractErrorMessage } from
    '../../shared/error-helpers.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import { log } from '../app/logger.ts';
import {
    ICON_SIZE,
    iconPersonPlus, iconSearch,
    iconSend, iconMail,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { trimStrings } from '../app/format.ts';
import {
    handleDialogClick, closeDialog,
} from '../app/dialog.ts';
import {
    getMembers,
    getFormerMembers,
    fillHumanMemberProfile,
    queryMembershipEntities,
    postHumanMemberCreation,
    postAIMemberCreation,
    postServiceMemberCreation,
    postInvitation,
    type InvitationOutcome,
    subscribeHumanMemberChanges,
    subscribeAIMemberChanges,
    subscribeServiceMemberChanges,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { generateIdentifier } from '../../shared/identifier.ts';
import type { Member } from '../../shared/types.ts';
import { QUERY_TEXT_MAX_LENGTH } from
    '../../shared/search-match.ts';
import {
    ManagedMembersPresenter,
    buildInitialManagedMembersState,
    applyManagedMembersSearch,
    applyManagedMembersKind,
    buildModelOptgroups,
    humanMemberCreationFromDraft,
    type ManagedMembersState,
    type MemberKindFilter,
    type MemberSearch,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

// The pause after the last keystroke before the search
// sends its QUERY.
const SEARCH_PAUSE_MS = 200;

const NO_SEARCH: MemberSearch = { kind: 'none' };

// The list on screen: its roster, membership, and search
// move only when a read for them lands.
let membersState:
    ManagedMembersState | null = null;
let memberListEl: HTMLElement | null = null;
// Pressed button. It may lead the list during a read.
let chosenMembership: ManagedMembersState['membership'] =
    'accepted';
// Bumped by every keystroke, press, and bell: a read that
// finishes under an older number paints nothing.
let membersSequence = 0;
// False from a press or bell until a roster read after it
// lands: until then the painted roster is not the one to
// narrow, even when a keystroke drops the read in flight.
let rosterCurrent = true;
let searchTimer:
    ReturnType<typeof setTimeout> | undefined;

// Mint-once discipline (Phase 10 Task 2): the Add Member
// dialog mints its entity id ONCE per dialog session and reuses
// it across retries — a retry after a partial (second-hop PII
// PUT) failure re-submits against the SAME member rather than
// minting a fresh one and orphaning the first. Reset whenever
// the dialog opens (bindAddMemberDialog), so a later session
// never reuses a stale id from an abandoned earlier one.
let pendingMemberId: string | null = null;

function currentMemberId(): string {
    pendingMemberId ??= generateIdentifier();
    return pendingMemberId;
}

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
            const members = await fillHumanMemberProfile(
                ctx, await getMembers(ctx),
            );
            return { members };
        },
        retry: init,
        onData: loaded => {
            membersState =
                buildInitialManagedMembersState(
                    loaded.members,
                    ctx.identity.id,
                );
            rosterCurrent = true;

            memberListEl = memberList;
            rerenderMembers();
            memberListEl.addEventListener(
                'click', onMemberListClick,
                { signal },
            );

            subscribeHumanMemberChanges(rereadMembers);
            subscribeAIMemberChanges(rereadMembers);
            subscribeServiceMemberChanges(rereadMembers);
            // Text typed during the load, or a box the
            // browser restored on history navigation,
            // searches as if typed.
            if (searchText() !== '') void showMembers();
        },
    });
}

async function fetchMemberRoster(
    selected: ManagedMembersState['membership'],
): Promise<Member[]> {
    const ctx = sessionContext();
    if (selected === 'removed') {
        return await getFormerMembers(ctx);
    }
    return await fillHumanMemberProfile(
        ctx, await getMembers(ctx),
    );
}

async function queryMemberSearch(
    text: string,
    selected: ManagedMembersState['membership'],
): Promise<MemberSearch> {
    const answer = await queryMembershipEntities(
        sessionContext(), text, selected,
    );
    return {
        kind: 'matched',
        text,
        identityIds: answer.map(
            part => part.body().toValue().identity_id,
        ),
    };
}

function searchText(): string {
    return $inputRequired('#member-search', document)
        .value.trim();
}

function rereadMembers(): void {
    rosterCurrent = false;
    void showMembers();
}

// The pressed button and the box decide the list: that
// roster, narrowed while the box has text to its QUERY's
// answer. The painted roster serves while it is current
// and the button still names it; otherwise it is read
// again. Each read takes the next sequence number, so only
// the newest paints. A failed QUERY keeps the list on
// screen, never the whole roster for a search, though a
// fresh roster it came with replaces the stale one.
async function showMembers(): Promise<void> {
    if (!membersState) return;
    clearTimeout(searchTimer);
    membersSequence += 1;
    const sequence = membersSequence;
    const selected = chosenMembership;
    const text = searchText();
    const reread = !rosterCurrent
        || membersState.membership !== selected;
    const [members, search] = await Promise.allSettled([
        reread
            ? fetchMemberRoster(selected)
            : membersState.members,
        text === ''
            ? NO_SEARCH
            : queryMemberSearch(text, selected),
    ]);
    const rosterName = selected === 'removed'
        ? 'former members'
        : 'members';
    if (members.status === 'rejected') {
        log.error(
            rosterName + ' roster read failed',
            'members', members.reason,
        );
        failMembersRead(
            sequence,
            'Failed to load ' + rosterName,
            members.reason,
        );
        return;
    }
    if (search.status === 'rejected') {
        log.error(
            rosterName + ' search failed',
            'members', search.reason,
        );
        keepFreshRoster(sequence, selected, members.value);
        failMembersRead(
            sequence,
            'Failed to search ' + rosterName,
            search.reason,
        );
        return;
    }
    if (!membersState || sequence !== membersSequence) return;
    membersState = applyManagedMembersSearch(
        {
            ...membersState,
            members: members.value,
            membership: selected,
        },
        search.value,
    );
    rosterCurrent = true;
    rerenderMembers();
}

// The list stays as painted; the next paint narrows the
// fresh roster rather than reading it again.
function keepFreshRoster(
    sequence: number,
    selected: ManagedMembersState['membership'],
    members: Member[],
): void {
    if (
        !membersState
        || sequence !== membersSequence
        || membersState.membership !== selected
    ) return;
    membersState = { ...membersState, members };
    rosterCurrent = true;
}

function failMembersRead(
    sequence: number,
    failure: string,
    err: unknown,
): void {
    if (!membersState || sequence !== membersSequence) return;
    pressMembershipState(membersState.membership);
    showToast(
        failure + ': ' + extractErrorMessage(err),
        'error',
    );
}

function rerenderMembers(): void {
    if (!membersState || !memberListEl) return;
    new ManagedMembersPresenter(membersState)
        .renderList(memberListEl);
}

function initMemberListFilters(): void {
    const search = $inputRequired('#member-search', document);
    search.maxLength = QUERY_TEXT_MAX_LENGTH;
    search.addEventListener(
        'input', onSearchInput,
        { signal },
    );
    $$('[data-kind-chip]', document).forEach(chip => {
        chip.addEventListener(
            'click', onKindChipClick,
            { signal },
        );
    });
    bindMembershipState();
}

const MEMBERSHIP_STATES: readonly (
    ManagedMembersState['membership']
)[] = ['accepted', 'removed'];

function membershipStateButton(
    selected: ManagedMembersState['membership'],
): HTMLElement | null {
    return $(
        '[data-membership-state="'
            + selected + '"]',
        document,
    );
}

function bindMembershipState(): void {
    for (const selected of MEMBERSHIP_STATES) {
        membershipStateButton(selected)
            ?.addEventListener(
                'click', onMembershipStateClick,
                { signal },
            );
    }
}

function pressMembershipState(
    selected: ManagedMembersState['membership'],
): void {
    chosenMembership = selected;
    for (const candidate of MEMBERSHIP_STATES) {
        membershipStateButton(candidate)
            ?.setAttribute(
                'aria-pressed',
                candidate === selected
                    ? 'true'
                    : 'false',
            );
    }
}

function onMembershipStateClick(e: Event): void {
    if (!membersState || !memberListEl) return;
    const target = e.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    const selected = target.getAttribute(
        'data-membership-state',
    );
    if (
        selected !== 'accepted'
        && selected !== 'removed'
    ) return;
    pressMembershipState(selected);
    rereadMembers();
}

// An emptied box shows the whole roster at once; text
// waits for the pause, so one QUERY follows a burst of
// keystrokes.
function onSearchInput(): void {
    if (!membersState || !memberListEl) return;
    membersSequence += 1;
    clearTimeout(searchTimer);
    if (searchText() === '') {
        void showMembers();
        return;
    }
    searchTimer = setTimeout(() => {
        void showMembers();
    }, SEARCH_PAUSE_MS);
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
        && kind !== 'service'
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
    // A fresh dialog session gets a fresh id (mint-once
    // discipline above) — mirrors bindInviteMemberDialog's own
    // reset-on-open pattern for its field error.
    $required('#add-member-btn', document)
        .addEventListener(
            'click',
            () => {
                pendingMemberId = null;
                clearAddMemberFields();
            },
            { signal },
        );
}

// The dialog's inputs are static markup, so a cancelled,
// escaped, or submitted session would greet the next one with
// last time's text. Open is the one path all three share.
function clearAddMemberFields(): void {
    $input('#hw-name', document)!.value = '';
    $input('#hw-email', document)!.value = '';
    $input('#hw-title', document)!.value = '';
    $input('#hw-phone', document)!.value = '';
    $textarea('#hw-bio', document)!.value = '';
    $input('#ai-name', document)!.value = '';
    $textarea('#ai-description', document)!.value = '';
    $textarea('#ai-skill-focus', document)!.value = '';
    $input('#service-name', document)!.value = '';
    $textarea('#service-description', document)!.value = '';
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
// element — kept open so the admin can correct the email.
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
    let outcome: InvitationOutcome;
    try {
        outcome = await postInvitation(
            sessionContext(), email,
        );
    } catch (err) {
        // An unexpected fault — the server's expected 404 / 409
        // come back as outcomes below, never as a throw.
        log.error(
            'postInvitation failed',
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
    // Switching Kind starts a NEW logical operation, so the
    // mint-once id (above) must not follow it: reusing the id
    // would let a switched-to submit re-put the OTHER kind's
    // facet onto an entity already claimed by the first kind's
    // partial create. Retries WITHIN a kind still reuse the id
    // via currentMemberId()'s lazy mint.
    pendingMemberId = null;
    const target = e.target as HTMLInputElement;
    const kind = target.value;
    const humanForm = $(
        '#add-member-human-form', document,
    );
    const aiForm = $(
        '#add-member-ai-form', document,
    );
    const serviceForm = $(
        '#add-member-service-form', document,
    );
    if (!humanForm || !aiForm || !serviceForm) return;
    humanForm.classList.toggle('hidden', kind !== 'human');
    aiForm.classList.toggle('hidden', kind !== 'ai');
    serviceForm.classList.toggle(
        'hidden', kind !== 'service',
    );
}

function onDialogKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (!target.matches('input.input')) return;
    e.preventDefault();
    e.stopPropagation();
    $('#add-member-submit', document)?.click();
}

function selectedKind(): 'human' | 'ai' | 'service' {
    const checked = $input(
        '#add-member-kind-toggle'
        + ' input[name="member-kind"]:checked',
        document,
    );
    if (checked && checked.value === 'ai') {
        return 'ai';
    }
    if (checked && checked.value === 'service') {
        return 'service';
    }
    return 'human';
}

async function handleAddMemberSubmit(
): Promise<void> {
    const kind = selectedKind();
    if (kind === 'human') {
        await submitHumanForm();
    } else if (kind === 'ai') {
        await submitAIForm();
    } else {
        await submitServiceForm();
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
    const id = currentMemberId();
    const ctx = sessionContext();
    try {
        await postHumanMemberCreation(
            ctx,
            id,
            trimStrings(humanMemberCreationFromDraft({
                name,
                email,
                title,
                department: dept,
                phone,
                bio,
            })),
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add member', err,
        );
        return;
    }
    showToast('Member added', 'success');
    closeDialog('add-member');
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
    const id = currentMemberId();
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
}

async function submitServiceForm(): Promise<void> {
    const name = $input(
        '#service-name', document,
    )!.value;
    const description = $textarea(
        '#service-description', document,
    )!.value;
    if (!name || !description) {
        showToast(
            'Name and description are required',
            'error',
        );
        return;
    }
    const id = currentMemberId();
    const ctx = sessionContext();
    try {
        await postServiceMemberCreation(
            ctx,
            id,
            trimStrings({ name, description }),
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to add service member', err,
        );
        return;
    }
    showToast('Service member added', 'success');
    closeDialog('add-member');
}
