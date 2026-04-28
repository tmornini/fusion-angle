import {
    html, SafeHtml,
} from '../safe-html.ts';
import {
    iconCreditCard, iconBuilding,
    iconCrown, iconCheckCircle2,
    iconActivity, iconUsers,
    iconFolderKanban, iconLightbulb,
    iconCalendar, iconTrendingUp,
    iconExternalLink,
} from '../icons.ts';
import type {
    Organization,
    RecentActivityItem,
} from '../adapters/index.ts';

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

export class OrganizationPresenter {
    readonly #org: Organization;
    readonly #companyName: string;
    readonly #recentActivity:
        readonly RecentActivityItem[];

    constructor(
        org: Organization,
        companyName: string,
        recentActivity:
            readonly RecentActivityItem[],
    ) {
        this.#org = org;
        this.#companyName = companyName;
        this.#recentActivity = recentActivity;
    }

    buildPage(): SafeHtml {
        const org = this.#org;
        const seats = org.seatsUsage();
        return html`
    <div class="content-wrap-xl">
        <div class="mb-8">
            <h1
                class="text-3xl font-display
                       font-bold mb-2"
            >Organization</h1>
            <p class="text-muted">
                Manage your organization
            </p>
        </div>

        <!-- Company Overview -->
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
                        >${this.#companyName}</h2>
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
                    iconUsers(16, ''),
                    'Active Users',
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
        </div>

        <!-- Usage Overview -->
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
                ${this.#buildUsageBar(
                    'User Seats',
                    org.usedSeats(),
                    org.totalSeats(),
                )}
                ${this.#buildUsageBar(
                    'Projects',
                    org.projectsCurrent(),
                    org.projectsLimit(),
                )}
                ${this.#buildUsageBar(
                    'Ideas',
                    org.ideasCurrent(),
                    org.ideasLimit(),
                )}
                ${this.#buildUsageBar(
                    'AI Credits',
                    org.aiCreditsCurrent(),
                    org.aiCreditsLimit(),
                )}
                ${this.#buildUsageBar(
                    'Storage (GB)',
                    org.storageCurrent(),
                    org.storageLimit(),
                )}
            </div>
        </div>

        <!-- Admin Links -->
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
                    >${iconUsers(20, '')}</span>
                    <div class="flex-fill"
                    >
                        <p class="${
                            'font-medium text-sm'
                        }">
                            Users
                        </p>
                        <p
                            class="text-xs
                                   text-muted
                                   truncate"
                        >
                            ${'Add, edit,'
                                + ' or remove'
                                + ' team members'}
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
        </div>
    </div>`;
    }

    static readonly USAGE_DANGER = 90;
    static readonly USAGE_WARNING = 70;

    #levelForUsage(
        current: number,
        limit: number,
    ): 'danger' | 'warning' | 'normal' {
        const percentage =
            (current / limit) * 100;
        if (percentage
            >= OrganizationPresenter
                .USAGE_DANGER
        ) {
            return 'danger';
        }
        if (percentage
            >= OrganizationPresenter
                .USAGE_WARNING
        ) {
            return 'warning';
        }
        return 'normal';
    }

    #buildUsageBar(
        label: string,
        current: number,
        limit: number,
    ): SafeHtml {
        const percentage = Math.min(
            100, (current / limit) * 100,
        );
        const level =
            this.#levelForUsage(
                current, limit,
            );
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
}
