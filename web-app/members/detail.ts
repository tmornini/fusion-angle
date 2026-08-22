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
    RequestError,
    HTTP_NOT_FOUND,
} from '../../api/http-errors.ts';
import {
    sessionContext,
    getHumanMember,
    getHumanMemberEntity,
    putHumanMember,
    subscribeHumanMemberChanges,
    getAIMember,
    getAIMemberEntity,
    putAIMember,
    subscribeAIMemberChanges,
    HumanMember,
    AIMember,
    type MemberPii,
    type IdentityPiiEntity,
} from '../app/adapters/index.ts';

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

type PageState = HumanState | AIState;

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

function buildPresenter():
    | HumanMemberDetailPresenter
    | HumanMemberDetailEditPresenter
    | AIMemberDetailPresenter
    | AIMemberDetailEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    if (state.variant === 'human') {
        return state.kind === 'reading'
            ? new HumanMemberDetailPresenter(
                state.member,
            )
            : new HumanMemberDetailEditPresenter(
                state.member, state.draft,
            );
    }
    return state.kind === 'reading'
        ? new AIMemberDetailPresenter(
            state.member,
        )
        : new AIMemberDetailEditPresenter(
            state.member, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

// Try human, then AI. A 404 on either kind is expected
// absence for that kind; only a dual 404 is genuine
// not-found (return null → caller redirects). Any other
// status is a real fault and must surface — never collapse
// into the silent redirect that absence uses.
function isNotFound(err: unknown): boolean {
    return err instanceof RequestError
        && err.status === HTTP_NOT_FOUND;
}

async function loadMemberByEitherKind(
    memberId: string,
): Promise<HumanMember | AIMember | null> {
    const ctx = sessionContext();
    try {
        return await getHumanMember(
            ctx, memberId,
        );
    } catch (errHuman) {
        if (!isNotFound(errHuman)) {
            throw errHuman;
        }
        try {
            return await getAIMember(
                ctx, memberId,
            );
        } catch (errAi) {
            if (isNotFound(errAi)) {
                return null;
            }
            throw errAi;
        }
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

    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: () => loadMemberByEitherKind(
            memberId,
        ),
        retry: () => init(params),
        onData: member => {
            if (!member) {
                navigateTo('members');
                return;
            }

            if (member.kind === 'human') {
                state = {
                    kind: 'reading',
                    variant: 'human',
                    member,
                };
            } else {
                state = {
                    kind: 'reading',
                    variant: 'ai',
                    member,
                };
            }
            buildPresenter()
                .renderShell(container);
            bindStableListeners(container);

            subscribeHumanMemberChanges(
                () => void refresh(memberId),
            );
            subscribeAIMemberChanges(
                () => void refresh(memberId),
            );
        },
    });
}

export function reduceRefresh(
    current: PageState,
    fresh: HumanMember | AIMember | null,
): PageState {
    if (current.kind === 'editing') return current;
    if (fresh === null) return current;
    if (fresh.kind === 'human') {
        return {
            kind: 'reading',
            variant: 'human',
            member: fresh,
        };
    }
    return {
        kind: 'reading',
        variant: 'ai',
        member: fresh,
    };
}

async function refresh(
    memberId: string,
): Promise<void> {
    if (!pageContainer || !state) return;
    const fresh = await loadMemberByEitherKind(
        memberId,
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
    } else {
        state = {
            kind: 'editing',
            variant: 'ai',
            member: state.member,
            draft: aiMemberDraftFromMember(
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
    if (state.variant === 'human') {
        state = {
            kind: 'reading',
            variant: 'human',
            member: state.member,
        };
    } else {
        state = {
            kind: 'reading',
            variant: 'ai',
            member: state.member,
        };
    }
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
    if (!isAIMemberFieldKey(field)) return;
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
    } else {
        await saveAIMember(state);
    }
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
    let row;
    try {
        row = await getHumanMemberEntity(
            ctx, memberId,
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to save member', err,
        );
        return;
    }
    const patch = trimStrings(
        humanMemberPatchFromDraft(s.draft),
    );
    const { id: _id, ...rest } = row;
    const {
        name, email, phone, bio, ...detailPatch
    } = patch;
    const nextDetail = { ...rest, ...detailPatch };
    const piiPatch = humanMemberPiiPatchIfDirty(
        { name, email, phone, bio }, s.member.pii(),
    );
    try {
        await putHumanMember(
            ctx, memberId, nextDetail, piiPatch,
        );
    } catch (err) {
        reportFault(
            ctx, 'Failed to save member', err,
        );
        return;
    }
    showToast('Member saved', 'success');
}

async function saveAIMember(
    s: Extract<
        AIState,
        { kind: 'editing' }
    >,
): Promise<void> {
    const memberId = s.member.idForLink();
    const ctx = sessionContext();
    let row;
    try {
        row = await getAIMemberEntity(
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
    const { id: _id, ...rest } = row;
    try {
        await putAIMember(
            ctx, memberId,
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
}
