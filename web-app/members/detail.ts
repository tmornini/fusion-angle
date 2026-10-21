import {
    $required, isFormField,
} from '../app/dom.ts';
import {
    HumanMemberDetailPresenter,
    HumanMemberDetailEditPresenter,
    humanMemberDraftFromMember,
    humanMemberPatchFromDraft,
    isHumanMemberFieldKey,
    type HumanMemberDraftFields,
    AIMemberDetailPresenter,
    AIMemberDetailEditPresenter,
    aiMemberDraftFromMember,
    aiMemberPatchFromDraft,
    isAIMemberFieldKey,
    type AIMemberDraftFields,
    ServiceMemberDetailPresenter,
    ServiceMemberDetailEditPresenter,
    serviceMemberDraftFromMember,
    serviceMemberPatchFromDraft,
    isServiceMemberFieldKey,
    type ServiceMemberDraftFields,
    seatRemovalOf, type SeatRemoval,
} from '../app/presenters/index.ts';
import { showToast } from '../app/toast.ts';
import {
    createPageAbort,
    bindPageListeners,
} from '../app/page-lifecycle.ts';
import { reportFault } from '../app/error-helpers.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/navigation.ts';
import { trimStrings } from '../app/format.ts';
import {
    closeDialog,
    handleDialogClick,
} from '../app/dialog.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
    HTTP_GONE,
} from '../../shared/http-errors.ts';
import {
    getHumanMember,
    getHumanMemberProfile,
    putHumanMember,
    subscribeHumanMemberChanges,
    getAIMember,
    getAIMemberEntity,
    putAIMember,
    subscribeAIMemberChanges,
    getServiceMember,
    getServiceMemberEntity,
    putServiceMember,
    subscribeServiceMemberChanges,
    getAdminSeatIds,
    postMembershipRemoval,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    HumanMember,
    AIMember,
    ServiceMember,
    type SeatedMember,
    type MemberPii,
    type IdentityPiiEntity,
} from '../../shared/types.ts';

const { signal } = createPageAbort();

type HumanState =
    | {
        kind: 'reading';
        variant: 'human';
        member: HumanMember;
    }
    | {
        kind: 'editing';
        variant: 'human';
        member: HumanMember;
        draft: HumanMemberDraftFields;
    };

type AIState =
    | {
        kind: 'reading';
        variant: 'ai';
        member: AIMember;
    }
    | {
        kind: 'editing';
        variant: 'ai';
        member: AIMember;
        draft: AIMemberDraftFields;
    };

type ServiceState =
    | {
        kind: 'reading';
        variant: 'service';
        member: ServiceMember;
    }
    | {
        kind: 'editing';
        variant: 'service';
        member: ServiceMember;
        draft: ServiceMemberDraftFields;
    };

type PageState = HumanState | AIState | ServiceState;

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;
let removal: SeatRemoval | null = null;

function removalOf(): SeatRemoval {
    if (removal === null) {
        throw new Error('seat removal not resolved');
    }
    return removal;
}

function buildPresenter():
    | HumanMemberDetailPresenter
    | HumanMemberDetailEditPresenter
    | AIMemberDetailPresenter
    | AIMemberDetailEditPresenter
    | ServiceMemberDetailPresenter
    | ServiceMemberDetailEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    if (state.variant === 'human') {
        return state.kind === 'reading'
            ? new HumanMemberDetailPresenter(
                state.member, removalOf(),
            )
            : new HumanMemberDetailEditPresenter(
                state.member, state.draft,
            );
    }
    if (state.variant === 'ai') {
        return state.kind === 'reading'
            ? new AIMemberDetailPresenter(
                state.member, removalOf(),
            )
            : new AIMemberDetailEditPresenter(
                state.member, state.draft,
            );
    }
    return state.kind === 'reading'
        ? new ServiceMemberDetailPresenter(
            state.member, removalOf(),
        )
        : new ServiceMemberDetailEditPresenter(
            state.member, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

// Try human, then AI, then service. A null human read, a
// 404, or a 410 on any kind is expected absence for that
// kind: a removed membership is not a member, as a
// never-seated one is not. Only absence on every kind is
// genuine not-found (return null → caller redirects). Any
// other status is a real fault and must surface — never
// collapse into the silent redirect that absence uses.
export function isAbsentMember(err: unknown): boolean {
    if (err === null) return true;
    return err instanceof RequestError
        && (err.status === HTTP_NOT_FOUND
            || err.status === HTTP_GONE);
}

async function loadMemberByEitherKind(
    memberId: string,
): Promise<SeatedMember | null> {
    const ctx = sessionContext();
    try {
        const human = await getHumanMember(
            ctx, memberId,
        );
        if (!isAbsentMember(human)) return human;
    } catch (errHuman) {
        if (!isAbsentMember(errHuman)) {
            throw errHuman;
        }
    }
    try {
        return await getAIMember(
            ctx, memberId,
        );
    } catch (errAi) {
        if (!isAbsentMember(errAi)) {
            throw errAi;
        }
    }
    try {
        return await getServiceMember(
            ctx, memberId,
        );
    } catch (errService) {
        if (isAbsentMember(errService)) {
            return null;
        }
        throw errService;
    }
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const memberId = params?.memberId;
    if (!memberId) {
        navigateTo('members');
        return;
    }

    const container = $required(
        '#member-detail-content', document,
    );
    pageContainer = container;

    const ctx = sessionContext();
    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: async () => ({
            member: await loadMemberByEitherKind(memberId),
            adminSeatIds: await getAdminSeatIds(ctx),
        }),
        retry: () => init(params),
        onData: ({ member, adminSeatIds }) => {
            if (!member) {
                navigateTo('members');
                return;
            }
            removal = seatRemovalOf(
                adminSeatIds, memberId, ctx.identity.id,
            );

            state = reduceSave(member);
            buildPresenter()
                .renderShell(container);
            bindStableListeners(container);

            subscribeHumanMemberChanges(
                () => void refresh(memberId),
            );
            subscribeAIMemberChanges(
                () => void refresh(memberId),
            );
            subscribeServiceMemberChanges(
                () => void refresh(memberId),
            );
        },
    });
}

export function reduceSave(
    fresh: SeatedMember,
): PageState {
    if (fresh.kind === 'human') {
        return {
            kind: 'reading',
            variant: 'human',
            member: fresh,
        };
    }
    if (fresh.kind === 'ai') {
        return {
            kind: 'reading',
            variant: 'ai',
            member: fresh,
        };
    }
    return {
        kind: 'reading',
        variant: 'service',
        member: fresh,
    };
}

export function reduceRefresh(
    current: PageState,
    fresh: SeatedMember | null,
): PageState {
    if (current.kind === 'editing') return current;
    if (fresh === null) return current;
    return reduceSave(fresh);
}

async function refresh(
    memberId: string,
): Promise<void> {
    if (!pageContainer || !state) return;
    const ctx = sessionContext();
    const fresh = await loadMemberByEitherKind(
        memberId,
    );
    removal = seatRemovalOf(
        await getAdminSeatIds(ctx), memberId, ctx.identity.id,
    );
    state = reduceRefresh(state, fresh);
    rerender();
}

function bindStableListeners(
    container: HTMLElement,
): void {
    bindPageListeners(container, {
        click: e => onClick(e),
        input: e => onInput(e),
        change: e => onInput(e),
        keydown: e => onContainerKeydown(e),
    }, signal);
    document.addEventListener(
        'keydown',
        e => onDocumentKeydown(e),
        { signal },
    );
}

function onClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    // The Remove dialog lives inside the container, so its
    // open, cancel, and backdrop clicks arrive here — one
    // voice with every other dialog surface.
    if (handleDialogClick(target, e)) return;

    const actionEl = target.closest(
        '[data-member-action]',
    );
    const action = actionEl?.getAttribute(
        'data-member-action',
    );
    if (action === 'back') {
        navigateTo('members');
        return;
    }
    if (action === 'edit') {
        beginEdit();
        return;
    }
    if (action === 'cancel') {
        cancelEdit();
        return;
    }
    if (action === 'save') {
        void handleSave();
        return;
    }
    if (action === 'confirm-remove') {
        closeDialog('confirm-remove');
        void performRemove();
        return;
    }

    const chip = target.closest(
        '.strength-chip',
    );
    if (
        chip
        && state
        && state.kind === 'editing'
        && state.variant === 'human'
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

function beginEdit(): void {
    if (!state || state.kind !== 'reading') {
        return;
    }
    if (state.variant === 'human') {
        state = {
            kind: 'editing',
            variant: 'human',
            member: state.member,
            draft: humanMemberDraftFromMember(
                state.member,
            ),
        };
    } else if (state.variant === 'ai') {
        state = {
            kind: 'editing',
            variant: 'ai',
            member: state.member,
            draft: aiMemberDraftFromMember(
                state.member,
            ),
        };
    } else {
        state = {
            kind: 'editing',
            variant: 'service',
            member: state.member,
            draft: serviceMemberDraftFromMember(
                state.member,
            ),
        };
    }
    rerender();
}

function cancelEdit(): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    state = reduceSave(state.member);
    rerender();
}

function onInput(e: Event): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target;
    if (!isFormField(target)) return;
    const field = target.getAttribute(
        'data-member-field',
    );
    if (state.variant === 'human') {
        if (!isHumanMemberFieldKey(field)) return;
        state = {
            ...state,
            draft: {
                ...state.draft,
                [field]: target.value,
            },
        };
        return;
    }
    if (state.variant === 'ai') {
        if (!isAIMemberFieldKey(field)) return;
        state = {
            ...state,
            draft: {
                ...state.draft,
                [field]: target.value,
            },
        };
        return;
    }
    if (!isServiceMemberFieldKey(field)) return;
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
    cancelEdit();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    if (state.variant === 'human') {
        await saveHumanMember(state);
    } else if (state.variant === 'ai') {
        await saveAIMember(state);
    } else {
        await saveServiceMember(state);
    }
}

async function performRemove(): Promise<void> {
    if (!state) return;
    const ctx = sessionContext();
    try {
        await postMembershipRemoval(ctx, state.member);
    } catch (err) {
        reportFault(ctx, 'Failed to remove member', err);
        return;
    }
    showToast('Member removed', 'success');
    navigateTo('members');
}

// The detail save's dirty check for the PII second hop (Phase
// 10 Task 2, delta 4): compares the draft's four contact fields
// — already normalized by the SAME trimStrings the save applies
// — against the member's FETCHED pii. An erased original has no
// stored fields to compare, so it baselines against blank
// strings — the SAME fallback humanMemberDraftFromMember uses to
// seed the draft in the first place, so an untouched erased
// member never fires a spurious PUT. Returns the pii patch to
// send, or undefined when nothing differs — the detail-only
// save stays ONE hop.
export function humanMemberPiiPatchIfDirty(
    patch: {
        name: string; email: string;
        phone: string; bio: string;
    },
    original: MemberPii,
): Omit<IdentityPiiEntity, 'id'> | undefined {
    const baseline = original.erased
        ? { name: '', email: '', phone: '', bio: '' }
        : original;
    const dirty =
        patch.name !== baseline.name
        || patch.email !== baseline.email
        || patch.phone !== baseline.phone
        || patch.bio !== baseline.bio;
    return dirty ? { ...patch } : undefined;
}

async function saveHumanMember(
    s: Extract<
        HumanState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const memberId = s.member.idForLink();
    const ctx = sessionContext();
    let profile;
    let read;
    try {
        ({ profile, read } = await getHumanMemberProfile(
            ctx, memberId,
        ));
    } catch (err) {
        reportFault(
            ctx, 'Failed to save member', err,
        );
        return;
    }
    const patch = trimStrings(
        humanMemberPatchFromDraft(s.draft),
    );
    const {
        name, email, phone, bio, ...detailPatch
    } = patch;
    const nextDetail = {
        ...detailPatch,
        team_dimensions: profile.present
            ? { ...profile.team_dimensions }
            : {},
    };
    const piiPatch = humanMemberPiiPatchIfDirty(
        { name, email, phone, bio }, s.member.pii(),
    );
    try {
        await putHumanMember(
            ctx, memberId,
            { held: read, body: nextDetail },
            piiPatch === undefined
                ? undefined
                : { current: s.member.pii(), body: piiPatch },
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to save member', err,
        );
        return;
    }
    showToast('Member saved', 'success');
    let fresh;
    try {
        fresh = await getHumanMember(ctx, memberId);
    } catch (err) {
        reportFault(
            ctx, 'Failed to reload member', err,
        );
        return;
    }
    if (fresh === null) {
        reportFault(
            ctx, 'Failed to reload member',
            new Error('the member read returned nothing'),
        );
        return;
    }
    state = reduceSave(fresh);
    rerender();
}

async function saveAIMember(
    s: Extract<
        AIState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const memberId = s.member.idForLink();
    const ctx = sessionContext();
    let held;
    try {
        held = await getAIMemberEntity(
            ctx, memberId,
        );
    } catch (err) {
        reportFault(
            ctx,
            'Failed to save AI member',
            err,
        );
        return;
    }
    // putAIMember writes the whole row, so
    // merge the edited fields onto the stored
    // row to form the complete entity.
    const patch = trimStrings(
        aiMemberPatchFromDraft(s.draft),
    );
    const { id: _id, ...rest } = held.body().toValue();
    try {
        await putAIMember(
            ctx, held,
            { ...rest, ...patch },
        );
    } catch (err) {
        reportFault(
            ctx,
            'Failed to save AI member',
            err,
        );
        return;
    }
    showToast(
        'AI member saved', 'success',
    );
    let fresh;
    try {
        fresh = await getAIMember(ctx, memberId);
    } catch (err) {
        reportFault(
            ctx, 'Failed to reload AI member', err,
        );
        return;
    }
    state = reduceSave(fresh);
    rerender();
}

async function saveServiceMember(
    s: Extract<
        ServiceState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const patch = trimStrings(
        serviceMemberPatchFromDraft(s.draft),
    );
    if (patch.name === '' || patch.description === '') {
        showToast(
            'Name and description are required',
            'error',
        );
        return;
    }
    const memberId = s.member.idForLink();
    const ctx = sessionContext();
    let held;
    try {
        held = await getServiceMemberEntity(
            ctx, memberId,
        );
    } catch (err) {
        reportFault(
            ctx,
            'Failed to save service member',
            err,
        );
        return;
    }
    // putServiceMember writes the whole document, so
    // merge the edited fields onto the stored one.
    const { id: _id, ...rest } = held.body().toValue();
    try {
        await putServiceMember(
            ctx, held,
            { ...rest, ...patch },
        );
    } catch (err) {
        reportFault(
            ctx,
            'Failed to save service member',
            err,
        );
        return;
    }
    showToast(
        'Service member saved', 'success',
    );
    let fresh;
    try {
        fresh = await getServiceMember(ctx, memberId);
    } catch (err) {
        reportFault(
            ctx, 'Failed to reload service member', err,
        );
        return;
    }
    state = reduceSave(fresh);
    rerender();
}
