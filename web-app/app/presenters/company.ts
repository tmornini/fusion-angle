import {
    html, mutateHtml, SafeHtml,
} from '../safe-html';
import { $required } from '../dom';
import {
    iconBuilding, iconSave,
    iconEdit, iconX,
} from '../icons';
import type {
    Company,
} from '../adapters';

export type CompanyFieldKey =
    | 'name' | 'domain';

function buildShell(
    container: HTMLElement,
): void {
    mutateHtml(container, html`
<div class="content-wrap">
    <div class="company-header-slot"></div>
    <div class="company-body-slot"></div>
</div>`);
}

function mutateHeader(
    container: HTMLElement,
    markup: SafeHtml,
): void {
    mutateHtml(
        $required(
            '.company-header-slot', container,
        ),
        markup,
    );
}

function mutateBody(
    container: HTMLElement,
    markup: SafeHtml,
): void {
    mutateHtml(
        $required(
            '.company-body-slot', container,
        ),
        markup,
    );
}

function buildHeader(
    buttons: SafeHtml,
): SafeHtml {
    return html`
        <div class="page-header">
            <div>
                <h1 class="${
                    'text-3xl font-display'
                    + ' font-bold mb-2'
                }">Company</h1>
                <p class="text-muted">${
                    "Manage your organization's"
                    + ' configuration'
                }</p>
            </div>
            ${buttons}
        </div>`;
}

function buildReadonlyField(
    id: string,
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="${id}">${
                label
            }</label>
            <p class="text-sm">${value}</p>
        </div>`;
}

function buildEditableField(
    id: string,
    field: CompanyFieldKey,
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="${id}">${
                label
            }</label>
            <input class="input"
                id="${id}"
                data-company-field="${field}"
                value="${value}" />
        </div>`;
}

function buildCard(
    body: SafeHtml,
): SafeHtml {
    return html`
        <div class="${
            'card card-hover p-6 mb-6'
        }">
            <h3 class="${
                'font-display font-semibold'
                + ' mb-4 flex items-center'
                + ' gap-2'
            }">${
                iconBuilding(20, '')
            } General Information</h3>
            <div class="${
                'grid grid-cols-2 gap-4'
            }">
                ${body}
            </div>
        </div>`;
}

export class CompanyPresenter {
    readonly #company: Company;

    constructor(company: Company) {
        this.#company = company;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateHeader(
            container, this.#buildHeader(),
        );
        mutateBody(
            container, this.#buildCard(),
        );
    }

    #buildHeader(): SafeHtml {
        return buildHeader(html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="company-edit-btn"
                data-company-action="edit">
                ${iconEdit(16, '')} Edit
            </button>`);
    }

    #buildCard(): SafeHtml {
        const c = this.#company;
        return buildCard(html`
            ${buildReadonlyField(
                'company-name',
                'Company Name',
                c.name,
            )}
            ${buildReadonlyField(
                'company-domain',
                'Domain',
                c.domain,
            )}`);
    }
}

export class CompanyEditPresenter {
    readonly #draft: Company;

    constructor(draft: Company) {
        this.#draft = draft;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateHeader(
            container, this.#buildHeader(),
        );
        mutateBody(
            container, this.#buildCard(),
        );
    }

    #buildHeader(): SafeHtml {
        return buildHeader(html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="company-cancel-btn"
                    data-company-action="cancel">
                    ${iconX(16, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="company-save-btn"
                    data-company-action="save">
                    ${iconSave(16, '')} Save
                </button>
            </div>`);
    }

    #buildCard(): SafeHtml {
        const d = this.#draft;
        return buildCard(html`
            ${buildEditableField(
                'company-name',
                'name',
                'Company Name',
                d.name,
            )}
            ${buildEditableField(
                'company-domain',
                'domain',
                'Domain',
                d.domain,
            )}`);
    }
}
