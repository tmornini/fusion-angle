import { $ } from '../app/dom';
import {
    CompanyPresenter,
    CompanyEditPresenter,
    type CompanyFieldKey,
} from '../app/presenters';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import { trimStrings } from '../app/core';
import {
    getCompany,
    putCompany,
    type Company,
} from '../app/adapters';

const pageAbort = new AbortController();
const signal = pageAbort.signal;

type PageState =
    | {
        kind: 'reading';
        company: Company;
    }
    | {
        kind: 'editing';
        company: Company;
        draft: Company;
    };

let state: PageState | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<CompanyFieldKey> =
    new Set(['name', 'domain']);

function isFieldKey(
    s: string | null,
): s is CompanyFieldKey {
    return s !== null
        && FIELDS.has(s as CompanyFieldKey);
}

function buildPresenter():
    CompanyPresenter | CompanyEditPresenter
{
    if (state === null) {
        throw new Error(
            'state not initialized',
        );
    }
    return state.kind === 'reading'
        ? new CompanyPresenter(state.company)
        : new CompanyEditPresenter(state.draft);
}

function rerender(): void {
    if (!pageContainer) return;
    buildPresenter()
        .renderUpdate(pageContainer);
}

export async function init(): Promise<void> {
    const container = $(
        '#company-content', document,
    );
    if (!container) return;
    pageContainer = container;

    let company: Company;
    try {
        company = await getCompany();
    } catch (err) {
        log.error(
            'getCompany failed',
            'company',
            err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load company.',
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

    state = { kind: 'reading', company };
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
    const action = target
        .closest('[data-company-action]')
        ?.getAttribute(
            'data-company-action',
        );
    if (action === 'edit') {
        if (
            !state
            || state.kind !== 'reading'
        ) return;
        state = {
            kind: 'editing',
            company: state.company,
            draft: { ...state.company },
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
            company: state.company,
        };
        rerender();
        return;
    }
    if (action === 'save') {
        void handleSave();
    }
}

function onInput(
    e: Event,
): void {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const target = e.target as
        | HTMLInputElement | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-company-field',
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
        company: state.company,
    };
    rerender();
}

async function handleSave(): Promise<void> {
    if (!state || state.kind !== 'editing') {
        return;
    }
    const updated = trimStrings(state.draft);
    try {
        await putCompany(updated);
    } catch (err) {
        log.error(
            'putCompany failed',
            'company',
            err,
        );
        showToast(
            'Failed to save company',
            'error',
        );
        return;
    }
    showToast('Company saved', 'success');
    state = {
        kind: 'reading',
        company: updated,
    };
    rerender();
}
