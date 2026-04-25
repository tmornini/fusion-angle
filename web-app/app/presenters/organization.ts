import {
    html, SafeHtml,
} from '../safe-html';
import {
    iconCreditCard, iconBuilding,
    iconCrown, iconCheckCircle2,
    iconActivity, iconUsers,
    iconFolderKanban, iconLightbulb,
    iconCalendar, iconTrendingUp,
    iconExternalLink,
} from '../icons';
import { formatDate } from '../core';
import type { Organization } from '../adapters';

export class OrganizationPresenter {
    readonly #organization: Organization;

    constructor(organization: Organization) {
        this.#organization = organization;
    }

    buildPage(): SafeHtml {
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
                        >${
                            this.#organization
                                .companyNameText()
                        }</h2>
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
                                ${this.#organization
                                    .planName()
                                } Plan
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
                            ${this.#organization
                                .healthStatusText()}
                        </span>
                    </div>
                    <p class="text-xs mt-1">
                        ${'Health Score: '
                            + this.#organization
                                .healthScoreValue()
                            + '%'}
                    </p>
                </div>
            </div>

            <div
                class="grid grid-cols-2
                       lg:grid-cols-4 gap-4"
            >
                <div class="stat-cell">
                    <div
                        class="flex items-center
                               gap-2 text-muted
                               mb-1"
                    >
                        ${iconUsers(16, '')}
                        <span class="text-xs">
                            Active Users
                        </span>
                    </div>
                    <p class="${
                        'text-2xl font-bold'
                    }">
                        ${this.#organization
                            .usedSeatCount()
                        }<span
                            class="text-sm
                                   font-normal
                                   text-muted"
                        >/${this.#organization
                            .seatCount()
                        }</span>
                    </p>
                </div>
                <div class="stat-cell">
                    <div
                        class="flex items-center
                               gap-2 text-muted
                               mb-1"
                    >
                        ${iconFolderKanban(
                            16, '',
                        )}
                        <span class="text-xs">
                            Projects
                        </span>
                    </div>
                    <p class="${
                        'text-2xl font-bold'
                    }">
                        ${this.#organization
                            .projectsCurrentCount()
                        }
                    </p>
                </div>
                <div class="stat-cell">
                    <div
                        class="flex items-center
                               gap-2 text-muted
                               mb-1"
                    >
                        ${iconLightbulb(16, '')}
                        <span class="text-xs">
                            Ideas
                        </span>
                    </div>
                    <p class="${
                        'text-2xl font-bold'
                    }">
                        ${this.#organization
                            .ideasCurrentCount()
                        }
                    </p>
                </div>
                <div class="stat-cell">
                    <div
                        class="flex items-center
                               gap-2 text-muted
                               mb-1"
                    >
                        ${iconCalendar(16, '')}
                        <span class="text-xs">
                            Next Billing
                        </span>
                    </div>
                    <p class="${
                        'text-lg font-bold'
                    }">
                        ${formatDate(
                            this.#organization
                                .nextBillingDate(),
                        )}
                    </p>
                </div>
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
                    this.#organization
                        .usedSeatCount(),
                    this.#organization
                        .seatCount(),
                )}
                ${this.#buildUsageBar(
                    'Projects',
                    this.#organization
                        .projectsCurrentCount(),
                    this.#organization
                        .projectsLimitCount(),
                )}
                ${this.#buildUsageBar(
                    'Ideas',
                    this.#organization
                        .ideasCurrentCount(),
                    this.#organization
                        .ideasLimitCount(),
                )}
                ${this.#buildUsageBar(
                    'AI Credits',
                    this.#organization
                        .aiCreditsCurrentValue(),
                    this.#organization
                        .aiCreditsLimitValue(),
                )}
                ${this.#buildUsageBar(
                    'Storage (GB)',
                    this.#organization
                        .storageCurrentValue(),
                    this.#organization
                        .storageLimitValue(),
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
