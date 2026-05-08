import {
    html, SafeHtml,
} from '../safe-html.ts';
import {
    iconCreditCard, iconBuilding,
    iconCrown, iconCheckCircle2,
    iconActivity, iconPeople,
    iconFolderKanban, iconLightbulb,
    iconCalendar, iconTrendingUp,
    iconExternalLink,
    iconEdit, iconSave, iconX,
} from '../icons.ts';
import type {
    Organization,
    GeneralInfoDraft,
} from '../adapters/index.ts';

export type GeneralInfoFieldKey =
    | 'name' | 'domain';

const STAT_VALUE_2XL = 'text-2xl font-bold';
const STAT_VALUE_LG = 'text-lg font-bold';

function buildStatCell(
    icon: SafeHtml,
    label: string,
    value: SafeHtml,
    valueClass: string,
): SafeHtml {
    return html`
        <div class="stat-cell">
            <div class="${
                'flex items-center gap-2'
                + ' text-muted mb-1'
            }">
                ${icon}
                <span class="text-xs">
                    ${label}
                </span>
            </div>
            <p class="${valueClass}">
                ${value}
            </p>
        </div>`;
}

function buildPageHeader(
    actions: SafeHtml,
): SafeHtml {
    return html`
        <div class="${
            'flex items-center'
            + ' justify-between gap-4'
            + ' mb-8 flex-wrap'
        }">
            <div>
                <h1
                    class="text-3xl font-display
                           font-bold mb-2"
                >Organization</h1>
                <p class="text-muted">
                    Manage your organization
                </p>
            </div>
            ${actions}
        </div>`;
}

function buildReadField(
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }">${label}</label>
            <p class="text-sm">${value}</p>
        </div>`;
}

function buildEditField(
    field: GeneralInfoFieldKey,
    label: string,
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="org-${field}">${
                label
            }</label>
            <input class="input"
                id="org-${field}"
                data-org-field="${field}"
                value="${value}" />
        </div>`;
}

function buildGeneralInfoCard(
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

function buildOverviewCard(
    org: Organization,
): SafeHtml {
    const seats = org.seatsUsage();
    return html`
        <div class="card card-hover p-6 mb-6">
            <div
                class="${
                    'flex items-center'
                    + ' justify-between gap-4'
                    + ' mb-6 flex-wrap'
                }"
            >
                <div
                    class="${
                        'flex items-center'
                        + ' gap-4 flex-1'
                    }"
                >
                    <div class="icon-box-lg"
                        data-tone="primary"
                    >${iconBuilding(28, '')}</div>
                    <div>
                        <h2
                            class="text-xl
                                   font-display
                                   font-semibold"
                        >${org.nameText()}</h2>
                        <div
                            class="flex
                                   items-center
                                   gap-2 mt-1"
                        >
                            <span
                                class="badge
                                       badge-default
                                       text-xs"
                            >
                                ${iconCrown(
                                    12, '',
                                )}
                                ${org.planLabel()}
                            </span>
                            <span class="${
                                'status-badge'
                                + '-success'
                            }">
                                ${iconCheckCircle2(
                                    12, '',
                                )}
                                Active
                            </span>
                        </div>
                    </div>
                </div>
                <div
                    class="${
                        'status-badge-success'
                        + ' health-badge'
                    }"
                >
                    <div
                        class="flex items-center
                               gap-2"
                    >
                        ${iconActivity(16, '')}
                        <span class="${
                            'text-sm font-medium'
                        }">
                            ${org
                                .healthStatusText()}
                        </span>
                    </div>
                    <p class="text-xs mt-1">
                        ${'Health Score: '
                            + org
                                .healthScorePercent()
                            + '%'}
                    </p>
                </div>
            </div>

            <div
                class="grid grid-cols-2
                       lg:grid-cols-4 gap-4"
            >
                ${buildStatCell(
                    iconPeople(16, ''),
                    'Active People',
                    html`${seats.used}<span class="${
                        'text-sm font-normal'
                        + ' text-muted'
                    }">/${seats.total}</span>`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconFolderKanban(16, ''),
                    'Projects',
                    html`${org
                        .projectsCurrent()}`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconLightbulb(16, ''),
                    'Ideas',
                    html`${org.ideasCurrent()}`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconCalendar(16, ''),
                    'Next Billing',
                    html`${org
                        .nextBillingDate()}`,
                    STAT_VALUE_LG,
                )}
            </div>
        </div>`;
}

const USAGE_DANGER = 90;
const USAGE_WARNING = 70;

function levelForUsage(
    current: number,
    limit: number,
): 'danger' | 'warning' | 'normal' {
    const percentage =
        (current / limit) * 100;
    if (percentage >= USAGE_DANGER) {
        return 'danger';
    }
    if (percentage >= USAGE_WARNING) {
        return 'warning';
    }
    return 'normal';
}

function buildUsageBar(
    label: string,
    current: number,
    limit: number,
): SafeHtml {
    const percentage = Math.min(
        100, (current / limit) * 100,
    );
    const level = levelForUsage(current, limit);
    return html`
    <div>
        <div
            class="flex items-center
                   justify-between
                   text-sm mb-1"
        >
            <span class="text-muted">
                ${label}
            </span>
            <span class="font-medium">
                ${current} / ${limit}
            </span>
        </div>
        <div class="progress">
            <div
                class="progress-bar"
                data-level="${level}"
                style="${
                    '--progress-fill:'
                    + percentage + '%'
                }"
            ></div>
        </div>
    </div>`;
}

function buildUsageCard(
    org: Organization,
): SafeHtml {
    return html`
        <div class="card card-hover p-6">
            <h3
                class="font-display
                       font-semibold mb-4
                       flex items-center gap-2"
            >
                ${iconTrendingUp(20, '')}
                Usage Overview
            </h3>
            <div class="flex flex-col gap-4">
                ${buildUsageBar(
                    'Seats',
                    org.usedSeats(),
                    org.totalSeats(),
                )}
                ${buildUsageBar(
                    'Projects',
                    org.projectsCurrent(),
                    org.projectsLimit(),
                )}
                ${buildUsageBar(
                    'Ideas',
                    org.ideasCurrent(),
                    org.ideasLimit(),
                )}
                ${buildUsageBar(
                    'AI Credits',
                    org.aiCreditsCurrent(),
                    org.aiCreditsLimit(),
                )}
                ${buildUsageBar(
                    'Storage (GB)',
                    org.storageCurrent(),
                    org.storageLimit(),
                )}
            </div>
        </div>`;
}

function buildAdminCard(): SafeHtml {
    return html`
        <div class="card card-hover p-6 mt-6">
            <h3
                class="font-display
                       font-semibold mb-4"
            >Security & Administration</h3>
            <div
                class="grid grid-cols-1
                       sm:grid-cols-3 gap-4"
            >
                <button
                    class="admin-link-card"
                    data-nav-to="users"
                >
                    <span class="text-muted"
                    >${iconPeople(20, '')}</span>
                    <div class="flex-fill"
                    >
                        <p class="${
                            'font-medium text-sm'
                        }">
                            People
                        </p>
                        <p
                            class="text-xs
                                   text-muted
                                   truncate"
                        >
                            ${'Add, edit,'
                                + ' or remove'
                                + ' members'}
                        </p>
                    </div>
                    ${iconExternalLink(16, '')}
                </button>
                <button
                    class="admin-link-card"
                >
                    <span class="text-muted"
                    >${iconCreditCard(
                        20, '',
                    )}</span>
                    <div class="flex-fill"
                    >
                        <p class="${
                            'font-medium text-sm'
                        }">
                            Billing History
                        </p>
                        <p
                            class="text-xs
                                   text-muted
                                   truncate"
                        >
                            ${'View invoices'
                                + ' and payments'}
                        </p>
                    </div>
                    ${iconExternalLink(16, '')}
                </button>
            </div>
        </div>`;
}

function buildPage(
    org: Organization,
    headerActions: SafeHtml,
    generalInfoBody: SafeHtml,
): SafeHtml {
    return html`
    <div class="content-wrap-xl">
        ${buildPageHeader(headerActions)}
        ${buildGeneralInfoCard(generalInfoBody)}
        ${buildOverviewCard(org)}
        ${buildUsageCard(org)}
        ${buildAdminCard()}
    </div>`;
}

export class OrganizationPresenter {
    readonly #org: Organization;

    constructor(org: Organization) {
        this.#org = org;
    }

    buildPage(): SafeHtml {
        const org = this.#org;
        const actions = html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="org-edit-btn"
                data-org-action="edit">
                ${iconEdit(16, '')} Edit
            </button>`;
        const body = html`
            ${buildReadField(
                'Organization Name',
                org.nameText(),
            )}
            ${buildReadField(
                'Domain',
                org.domainText(),
            )}`;
        return buildPage(org, actions, body);
    }
}

export class OrganizationEditPresenter {
    readonly #org: Organization;
    readonly #draft: GeneralInfoDraft;

    constructor(
        org: Organization,
        draft: GeneralInfoDraft,
    ) {
        this.#org = org;
        this.#draft = draft;
    }

    buildPage(): SafeHtml {
        const actions = html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="org-cancel-btn"
                    data-org-action="cancel">
                    ${iconX(16, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="org-save-btn"
                    data-org-action="save">
                    ${iconSave(16, '')} Save
                </button>
            </div>`;
        const body = html`
            ${buildEditField(
                'name',
                'Organization Name',
                this.#draft.name,
            )}
            ${buildEditField(
                'domain',
                'Domain',
                this.#draft.domain,
            )}`;
        return buildPage(
            this.#org, actions, body,
        );
    }
}
