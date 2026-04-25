import { $ } from '../app/dom';
import {
    CompanyPresenter,
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

let presenter: CompanyPresenter | null = null;
let pageContainer: HTMLElement | null = null;

const FIELDS: ReadonlySet<CompanyFieldKey> =
    new Set(['name', 'domain']);

function isFieldKey(
    s: string | null,
): s is CompanyFieldKey {
    return s !== null
        && FIELDS.has(s as CompanyFieldKey);
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

    presenter = new CompanyPresenter(company);
    presenter.renderShell(container);
    bindStableListeners(container, presenter);
}

function bindStableListeners(
    container: HTMLElement,
    p: CompanyPresenter,
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
    p: CompanyPresenter,
): void {
    const target = e.target as Element | null;
    if (!target) return;
    const action = target
        .closest('[data-company-action]')
        ?.getAttribute(
            'data-company-action',
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
    }
}

function onInput(
    e: Event,
    p: CompanyPresenter,
): void {
    const target = e.target as
        | HTMLInputElement | null;
    if (!target) return;
    const field = target.getAttribute(
        'data-company-field',
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
    p: CompanyPresenter,
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
    presenter.update(updated);
    presenter.renderUpdate(pageContainer);
}
