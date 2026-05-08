import { $, $$, getRequiredAttribute } from '../app/dom.ts';
import { setHtml } from '../app/safe-html.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    navigateTo, trimStrings,
} from '../app/core.ts';
import {
    getOrganization,
    putOrganizationGeneralInfo,
    createFetchContext,
    Organization,
    type GeneralInfoDraft,
} from '../app/adapters/index.ts';
import {
    OrganizationPresenter,
    OrganizationEditPresenter,
    type GeneralInfoFieldKey,
} from '../app/presenters/index.ts';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        org: Organization;
    }
    | {
        kind: 'editing';
        org: Organization;
        draft: GeneralInfoDraft;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<GeneralInfoFieldKey> =
    new Set(['name', 'domain']);

function isFieldKey(
    s: string | null,
): s is GeneralInfoFieldKey {
    return s !== null
        && FIELDS.has(s as GeneralInfoFieldKey);
}

function buildPresenter():
    | OrganizationPresenter
    | OrganizationEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new OrganizationPresenter(state.org)
        : new OrganizationEditPresenter(
            state.org, state.draft,
        );
}

function rerender(): void {
    if (!pageContainer) return;
    setHtml(
        pageContainer,
        buildPresenter().buildPage(),
    );
    bindNavButtons();
}

function bindNavButtons(): void {
    $$('[data-nav-to]', document).forEach(
        navButton => {
            navButton.addEventListener(
                'click',
                () => navigateTo(
                    getRequiredAttribute(
                        navButton, 'data-nav-to',
                    ),
                ),
                { signal },
            );
        },
    );
}

export async function init(): Promise<void> {
    const container =
        $('#organization-content', document);
    if (!container) return;
    pageContainer = container;
    bindStableListeners(container);

    setHtml(
        container,
        buildSkeleton('detail', 4),
    );

    let org: Organization;
    try {
        org = await getOrganization(
            createFetchContext(),
        );
    } catch (err) {
        log.error(
            'getOrganization failed',
            'organization',
            err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' organization data.',
                'Try Again',
            ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                'click', () => init(),
                { signal },
            );
        return;
    }

    state = { kind: 'reading', org };
    rerender();
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
    const action = target
        .closest('[data-org-action]')
        ?.getAttribute('data-org-action');
    if (action === 'edit') {
        if (!state || state.kind !== 'reading') {
            return;
        }
        state = {
            kind: 'editing',
            org: state.org,
            draft: state.org
                .toGeneralInfoDraft(),
        };
        rerender();
        return;
    }
    if (action === 'cancel') {
        if (!state || state.kind !== 'editing') {
            return;
        }
        state = {
            kind: 'reading', org: state.org,
        };
        rerender();
        return;
    }
    if (action === 'save') {
        void handleSave();
    }
}

function onInput(e: Event): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target as
        | HTMLInputElement | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-org-field',
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
        kind: 'reading', org: state.org,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const trimmed = trimStrings(state.draft);
    const ctx = createFetchContext();
    try {
        await putOrganizationGeneralInfo(
            ctx, trimmed,
        );
    } catch (err) {
        log.error(
            'putOrganizationGeneralInfo failed',
            'organization',
            err,
        );
        showToast(
            'Failed to save organization',
            'error',
        );
        return;
    }
    showToast('Organization saved', 'success');
    const fresh = await getOrganization(
        createFetchContext(),
    );
    state = { kind: 'reading', org: fresh };
    rerender();
}
