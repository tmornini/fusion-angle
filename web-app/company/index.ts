import {
    $, $input, bindEnterToClick,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import {
    getCompany,
    putCompany,
    type Company,
} from '../app/adapters';
import {
    CompanyPresenter,
} from '../app/presenters';

const escapeController =
    { current: new AbortController() };

let currentCompany:
    Company | null = null;

function mutateCompanyPage(
    company: Company,
    isEditing: boolean,
): void {
    currentCompany = company;
    const container = $(
        '#company-content', document,
    );
    if (!container) return;
    const presenter =
        new CompanyPresenter(company);
    setHtml(
        container,
        presenter.buildPage(isEditing),
    );
    bindCompanyEvents(company, isEditing);
}

function bindCompanyEvents(
    company: Company,
    isEditing: boolean,
): void {
    escapeController.current.abort();
    escapeController.current =
        new AbortController();
    if (isEditing) {
        document.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    $(
                        '#company-cancel-btn',
                        document,
                    )?.click();
                }
            },
            {
                signal: escapeController
                    .current.signal,
            },
        );
        const saveSel = '#company-save-btn';
        bindEnterToClick(
            '#company-name',
            saveSel,
        );
        bindEnterToClick(
            '#company-domain',
            saveSel,
        );
    }
    $(
        '#company-edit-btn',
        document,
    )?.addEventListener(
        'click',
        () => mutateCompanyPage(
            company, true,
        ),
    );
    $(
        '#company-cancel-btn',
        document,
    )?.addEventListener(
        'click',
        () => mutateCompanyPage(
            company, false,
        ),
    );
    $(
        '#company-save-btn',
        document,
    )?.addEventListener(
        'click',
        handleSave,
    );
}

async function handleSave(): Promise<void> {
    if (!currentCompany) return;
    const name = $input(
        '#company-name', document,
    )!.value.trim();
    const domain = $input(
        '#company-domain', document,
    )!.value.trim();
    const updated: Company = {
        name, domain,
    };
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
    mutateCompanyPage(updated, false);
}

export async function init(): Promise<void> {
    const container = $(
        '#company-content', document,
    );
    if (!container) return;
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
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click',
                () => init(),
            );
        return;
    }
    mutateCompanyPage(company, false);
}
