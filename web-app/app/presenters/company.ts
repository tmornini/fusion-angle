import {
    html, SafeHtml,
} from '../safe-html';
import {
    iconBuilding, iconSave,
    iconEdit, iconX,
} from '../icons';
import type {
    Company,
} from '../adapters';

export class CompanyPresenter {
    readonly #company: Company;

    constructor(
        company: Company,
    ) {
        this.#company = company;
    }

    buildPage(
        isEditing: boolean,
    ): SafeHtml {
        return html`
    <div class="content-wrap">
        ${this.#buildHeader(isEditing)}
        ${this.#buildCard(isEditing)}
    </div>`;
    }

    #buildHeader(
        isEditing: boolean,
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
            ${this.#buildHeaderButtons(
                isEditing,
            )}
        </div>`;
    }

    #buildHeaderButtons(
        isEditing: boolean,
    ): SafeHtml {
        if (isEditing) {
            return html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="company-cancel-btn">
                    ${iconX(16, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="company-save-btn">
                    ${iconSave(16, '')} Save
                </button>
            </div>`;
        }
        return html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="company-edit-btn">
                ${iconEdit(16, '')} Edit
            </button>`;
    }

    #buildCard(
        isEditing: boolean,
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
                ${this.#buildField(
                    isEditing,
                    'company-name',
                    'Company Name',
                    this.#company.name,
                )}
                ${this.#buildField(
                    isEditing,
                    'company-domain',
                    'Domain',
                    this.#company.domain,
                )}
            </div>
        </div>`;
    }

    #buildField(
        isEditing: boolean,
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
                    ${isEditing
                        ? html`<input
                            class="input"
                            id="${id}"
                            value="${value}" />`
                        : html`<p class="${
                            'text-sm'
                        }">${value}</p>`}
                </div>`;
    }
}
