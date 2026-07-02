import {
    html, SafeHtml,
} from '../safe-html.ts';
import {
    ICON_SIZE,
    iconBuilding,
    iconPeople,
    iconFolderKanban, iconLightbulb,
    iconCalendar, iconTrendingUp,
    iconEdit, iconSave, iconX,
} from '../icons.ts';
import type {
    Organization,
    OrganizationStats,
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

function buildReadIdentity(
    organization: Organization,
): SafeHtml {
    return html`
        <h2 class="${
            'text-xl font-display'
            + ' font-semibold'
        }">${organization.nameText()}
            <span class="${
                'text-muted font-normal'
            }">·</span>
            <span class="${
                'text-muted font-normal'
            }">${organization.domainText()}</span>
        </h2>`;
}

function buildEditIdentity(
    draft: GeneralInfoDraft,
): SafeHtml {
    return html`
        <div class="${
            'flex flex-col gap-3'
            + ' max-w-md'
        }">
            ${buildEditField(
                'name',
                'Organization Name',
                draft.name,
            )}
            ${buildEditField(
                'domain',
                'Domain',
                draft.domain,
            )}
        </div>`;
}

function buildOverviewCard(
    organization: Organization,
    stats: OrganizationStats,
    identity: SafeHtml,
): SafeHtml {
    return html`
        <div class="card card-hover p-6 mb-6">
            <div
                class="${
                    'flex items-center'
                    + ' gap-4 mb-6'
                }"
            >
                <div class="icon-box-lg"
                    data-tone="primary"
                >${iconBuilding(ICON_SIZE['3xl'], '')}</div>
                <div>${identity}</div>
            </div>

            <div
                class="grid grid-cols-2
                       lg:grid-cols-4 gap-4"
            >
                ${buildStatCell(
                    iconPeople(ICON_SIZE.base, ''),
                    'Active People',
                    html`${stats
                        .activePeopleCount}`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconFolderKanban(ICON_SIZE.base, ''),
                    'Projects',
                    html`${stats.projectsCurrent}`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconLightbulb(ICON_SIZE.base, ''),
                    'Ideas',
                    html`${stats.ideasCurrent}`,
                    STAT_VALUE_2XL,
                )}
                ${buildStatCell(
                    iconCalendar(ICON_SIZE.base, ''),
                    'Next Billing',
                    html`${organization
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
    organization: Organization,
    stats: OrganizationStats,
): SafeHtml {
    return html`
        <div class="card card-hover p-6 mt-6">
            <h3
                class="font-display
                       font-semibold mb-4
                       flex items-center gap-2"
            >
                ${iconTrendingUp(ICON_SIZE.xl, '')}
                Usage Overview
            </h3>
            <div class="flex flex-col gap-4">
                ${buildUsageBar(
                    'Seats',
                    organization.usedSeats(),
                    organization.totalSeats(),
                )}
                ${buildUsageBar(
                    'Projects',
                    stats.projectsCurrent,
                    organization.projectsLimit(),
                )}
                ${buildUsageBar(
                    'Ideas',
                    stats.ideasCurrent,
                    organization.ideasLimit(),
                )}
            </div>
        </div>`;
}

function buildPage(
    organization: Organization,
    stats: OrganizationStats,
    headerActions: SafeHtml,
    identity: SafeHtml,
): SafeHtml {
    return html`
    <div class="overview">
        ${buildPageHeader(headerActions)}
        ${buildOverviewCard(organization, stats, identity)}
        <div id="objectives-box"></div>
        ${buildUsageCard(organization, stats)}
    </div>`;
}

export class OrganizationPresenter {
    readonly #org: Organization;
    readonly #stats: OrganizationStats;

    constructor(
        organization: Organization,
        stats: OrganizationStats,
    ) {
        this.#org = organization;
        this.#stats = stats;
    }

    buildPage(): SafeHtml {
        const organization = this.#org;
        const actions = html`
            <button class="${
                'btn btn-outline gap-2'
            }" id="org-edit-btn"
                data-org-action="edit">
                ${iconEdit(ICON_SIZE.base, '')} Edit
            </button>`;
        return buildPage(
            organization, this.#stats, actions,
            buildReadIdentity(organization),
        );
    }
}

export class OrganizationEditPresenter {
    readonly #org: Organization;
    readonly #stats: OrganizationStats;
    readonly #draft: GeneralInfoDraft;

    constructor(
        organization: Organization,
        stats: OrganizationStats,
        draft: GeneralInfoDraft,
    ) {
        this.#org = organization;
        this.#stats = stats;
        this.#draft = draft;
    }

    buildPage(): SafeHtml {
        const actions = html`
            <div class="flex gap-2">
                <button class="${
                    'btn btn-outline gap-2'
                }" id="org-cancel-btn"
                    data-org-action="cancel">
                    ${iconX(ICON_SIZE.base, '')} Cancel
                </button>
                <button class="${
                    'btn btn-primary gap-2'
                }" id="org-save-btn"
                    data-org-action="save">
                    ${iconSave(ICON_SIZE.base, '')} Save
                </button>
            </div>`;
        return buildPage(
            this.#org, this.#stats, actions,
            buildEditIdentity(this.#draft),
        );
    }
}
