import {
    html, setHtml, SafeHtml,
} from '../safe-html';
import { $ } from '../dom';
import {
    iconBuilding, iconSave,
    iconEdit, iconX,
} from '../icons';
import type {
    Company,
} from '../adapters';
import type { EditMode } from './edit-mode';

export type CompanyFieldKey =
    | 'name' | 'domain';

export class CompanyPresenter {
    #company: Company;
    #mode: EditMode<Company>
        = { kind: 'reading' };

    constructor(company: Company) {
        this.#company = company;
    }

    update(company: Company): void {
        this.#company = company;
        this.#mode = { kind: 'reading' };
    }

    beginEdit(): void {
        this.#mode = {
            kind: 'editing',
            draft: { ...this.#company },
        };
    }

    cancelEdit(): void {
        this.#mode = { kind: 'reading' };
    }

    isEditing(): boolean {
        return this.#mode.kind === 'editing';
    }

    setDraftField(
        field: CompanyFieldKey,
        value: string,
    ): void {
        if (this.#mode.kind !== 'editing') {
            throw new Error(
                'setDraftField requires'
                + ' editing mode',
            );
        }
        this.#mode.draft[field] = value;
    }

    draft(): Company {
        return this.#mode.kind === 'editing'
            ? this.#mode.draft
            : this.#company;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        setHtml(container, html`
<div class="content-wrap">
    <div class="company-header-slot"></div>
    <div class="company-body-slot"></div>
</div>`);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        this.#updateHeader(container);
        this.#updateBody(container);
    }

    #updateHeader(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.company-header-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildHeader());
    }

    #updateBody(
        container: HTMLElement,
    ): void {
        const slot = $(
            '.company-body-slot', container,
        );
        if (!slot) return;
        setHtml(slot, this.#buildCard());
    }

    #buildHeader(): SafeHtml {
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
            ${this.#buildHeaderButtons()}
        </div>`;
    }

    #buildHeaderButtons(): SafeHtml {
        if (this.isEditing()) {
            return html`
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
            </div>`;
        }
        return html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="company-edit-btn"
                data-company-action="edit">
                ${iconEdit(16, '')} Edit
            </button>`;
    }

    #buildCard(): SafeHtml {
        const c = this.draft();
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
                ${this.#buildField(
                    'company-name',
                    'name',
                    'Company Name',
                    c.name,
                )}
                ${this.#buildField(
                    'company-domain',
                    'domain',
                    'Domain',
                    c.domain,
                )}
            </div>
        </div>`;
    }

    #buildField(
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
                    ${this.isEditing()
                        ? html`<input
                            class="input"
                            id="${id}"
                            data-company-field="${
                                field
                            }"
                            value="${value}" />`
                        : html`<p class="${
                            'text-sm'
                        }">${value}</p>`}
                </div>`;
    }
}
