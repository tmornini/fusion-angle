import {
    html, SafeHtml,
} from '../safe-html';
import {
    iconBuilding, iconSave,
    iconChevronRight,
} from '../icons';
import type {
    CompanySettings,
} from '../adapters';

export class SettingsPresenter {
    readonly #settings: CompanySettings;

    constructor(
        settings: CompanySettings,
    ) {
        this.#settings = settings;
    }

    buildPage(): SafeHtml {
        return html`
    <div class="content-wrap">
        <nav class="${
            'flex items-center gap-2 '
            + 'text-sm text-muted mb-6'
        }">
            <a href="${
                '../administration/index.html'
            }" class="text-primary">${
                'Administration'
            }</a>
            ${iconChevronRight(14, '')}
            <span>Company Settings</span>
        </nav>

        <div class="${
            'flex items-center '
            + 'justify-between mb-8'
        }">
            <div>
                <h1 class="${
                    'text-3xl font-display '
                    + 'font-bold mb-2'
                }">Company Settings</h1>
                <p class="text-muted">${
                    "Manage your organization's"
                    + ' configuration'
                }</p>
            </div>
            <button class="${
                'btn btn-primary gap-2'
            }" id="${
                'company-settings-save-btn'
            }">${
                iconSave(16, '')
            } Save Changes</button>
        </div>

        <div class="${
            'card card-hover p-6 mb-6'
        }">
            <h3 class="${
                'font-display font-semibold '
                + 'mb-4 flex items-center'
                + ' gap-2'
            }">${
                iconBuilding(20, '')
            } General Information</h3>
            <div class="${
                'grid grid-cols-2 gap-4'
            }">
                <div>
                    <label class="${
                        'label mb-2 block'
                    }">Company Name</label>
                    <input class="input"
                        id="${
                            'company-settings'
                            + '-name'
                        }"
                        value="${
                            this.#settings.name
                        }" />
                </div>
                <div>
                    <label class="${
                        'label mb-2 block'
                    }">Domain</label>
                    <input class="input"
                        id="${
                            'company-settings'
                            + '-domain'
                        }"
                        value="${
                            this.#settings.domain
                        }" />
                </div>
            </div>
        </div>
    </div>`;
    }
}
