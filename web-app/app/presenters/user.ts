import { html, SafeHtml } from '../safe-html';
import { initials, formatDate } from '../core';
import {
    iconStar,
    iconTrendingUp,
    iconBriefcase,
    iconAward,
    iconChevronRight,
    iconBarChart,
    iconCheckCircle2,
    iconAlertCircle,
    iconClock,
    iconUserX,
    iconHeart,
    iconTarget,
    iconMessageSquare,
    iconZap,
    iconShield,
} from '../icons';
import {
    AVAILABILITY_HIGH,
    AVAILABILITY_LOW,
    type User,
} from '../adapters';

type AvailabilityTone =
    'success' | 'warning' | 'error';

function toneForAvailability(
    availability: number,
): AvailabilityTone {
    if (availability >= AVAILABILITY_HIGH)
        return 'success';
    if (availability >= AVAILABILITY_LOW)
        return 'warning';
    return 'error';
}

function buildStatusDot(
    availability: number,
): SafeHtml {
    const tone =
        toneForAvailability(availability);
    return html`<div class="status-dot"
        data-tone="${tone}"></div>`;
}

const DIMENSION_ICONS: Record<
    string,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    analytical: iconTarget,
    driver: iconZap,
    expressive: iconMessageSquare,
    amiable: iconHeart,
};

const ROLE_LABELS: Record<
    string,
    { label: string; icon: (
        size: number,
        cssClass: string,
    ) => SafeHtml }
> = {
    admin: {
        label: 'Admin',
        icon: iconShield,
    },
    manager: {
        label: 'Manager',
        icon: iconBriefcase,
    },
    member: {
        label: 'Member',
        icon: iconStar,
    },
};

export class UserPresenter {
    readonly #user: User;

    constructor(user: User) {
        this.#user = user;
    }

    idForLink(): string {
        return this.#user.idForLink();
    }

    matchesSearch(
        query: string,
    ): boolean {
        return this.#user.fullName()
            .toLowerCase()
            .includes(query)
            || this.#user.roleLabel()
                .toLowerCase()
                .includes(query)
            || this.#user.departmentLabel()
                .toLowerCase()
                .includes(query);
    }

    matchesUserSearch(
        query: string,
    ): boolean {
        return this.#user.fullName()
            .toLowerCase()
            .includes(query)
            || this.#user.emailAddress()
                .toLowerCase()
                .includes(query);
    }

    matchesRoleFilter(
        role: string,
    ): boolean {
        return role === 'all'
            || this.#user.roleLabel() === role;
    }

    matchesStatusFilter(
        status: string,
    ): boolean {
        return status === 'all'
            || this.#user.statusValue() === status;
    }

    buildMemberCard(
        selectedId: string | null,
    ): SafeHtml {
        const selectedClass =
            selectedId === this.#user.idForLink()
                ? ' card-selected'
                : '';
        return html`
    <div
        class="${
            'card card-hover p-5'
            + ' cursor-pointer'
            + selectedClass
        }"
        data-member-card="${this.#user.idForLink()}"
    >
        <div class="flex items-start gap-4">
            <div class="avatar-frame">
                <div class="icon-box-lg"
                    data-tone="primary">
                    <span
                        class="${
                            'text-lg font-bold'
                            + ' text-primary'
                        }"
                    >${
                        initials(
                            this.#user.fullName(),
                        )
                    }</span>
                </div>
                ${buildStatusDot(
                    this.#user.availabilityScore(),
                )}
            </div>
            <div class="flex-fill">
                <div
                    class="${
                        'flex flex-wrap'
                        + ' items-center'
                        + ' gap-2 mb-1'
                    }"
                >
                    <h3 class="${
                        'font-semibold'
                        + ' text-sm'
                    }">
                        ${this.#user.fullName()}
                    </h3>
                    <span
                        class="pill"
                        data-tone="${
                            toneForAvailability(
                                this.#user
                                .availabilityScore(),
                            )
                        }"
                    >${
                        this.#user.availabilityScore()
                    }%</span>
                </div>
                <p class="${
                    'text-xs text-muted mb-2'
                }">
                    ${this.#user.roleLabel()}
                    \u2022 ${this.#user.departmentLabel()}
                </p>
                <div
                    class="${
                        'flex flex-wrap'
                        + ' gap-1.5 mb-2'
                    }"
                >
                    ${this.#user
                        .parsedStrengths()
                        .slice(0, 3)
                        .map(s => html`
                    <span
                        class="${
                            'pill-tag'
                            + ' pill-tag-strength'
                        }"
                    >
                        ${iconStar(10, '')}
                        ${s}
                    </span>
                        `)}
                </div>
                <div
                    class="${
                        'flex items-center'
                        + ' gap-4'
                        + ' text-xs text-muted'
                    }"
                >
                    <span
                        class="${
                            'flex items-center'
                            + ' gap-1'
                        }"
                    >
                        ${iconTrendingUp(
                            14, 'text-success',
                        )}
                        ${this.#user
                            .performanceScoreValue()
                        }%
                    </span>
                    <span
                        class="${
                            'flex items-center'
                            + ' gap-1'
                        }"
                    >
                        ${iconBriefcase(14, '')}
                        ${this.#user
                            .currentProjectsCount()
                        } active
                    </span>
                    <span
                        class="${
                            'flex items-center'
                            + ' gap-1'
                            + ' hidden-mobile'
                        }"
                    >
                        ${iconAward(
                            14, 'text-primary',
                        )}
                        ${this.#user
                            .projectsCompletedCount()}
                        completed
                    </span>
                </div>
            </div>
            ${iconChevronRight(
                20, 'text-muted',
            )}
        </div>
    </div>`;
    }

    buildMemberDetail(): SafeHtml {
        return html`
    <div class="user-detail-wrap">
        <div class="${
            'user-detail-header'
        }">
            <div class="${
                'avatar avatar-2xl'
                + ' avatar-tinted'
                + ' mx-auto mb-4'
            }">
                <span
                    class="${
                        'text-2xl font-bold'
                        + ' text-primary'
                    }"
                >${
                    initials(
                        this.#user.fullName(),
                    )
                }</span>
            </div>
            <h3
                class="${
                    'text-lg font-display'
                    + ' font-semibold'
                }"
            >${this.#user.fullName()}</h3>
            <p class="text-sm text-muted">
                ${this.#user.roleLabel()}
            </p>
            <p class="text-xs text-muted">
                ${this.#user.emailAddress()}
            </p>
        </div>
        ${this.#buildDimensionsTab()}
        ${this.#buildPerformanceTab()}
    </div>`;
    }

    buildUserRow(): SafeHtml {
        return html`
        <div class="${
            'flex items-center '
            + 'gap-4 p-4 user-row-divider '
            + (this.#user.isDeactivated()
                ? 'opacity-50' : '')
        }">
            <div class="${
                'flex items-center'
                + ' gap-3 flex-2 min-w-0'
            }">
                <div class="${
                    'avatar avatar-tinted'
                }">
                    <span
                        class="${
                            'text-sm '
                            + 'font-bold '
                            + 'text-primary'
                        }">
                        ${initials(
                            this.#user.fullName(),
                        )}
                    </span>
                </div>
                <div class="${
                    'min-w-0'
                }">
                    <p class="${
                        'font-medium '
                        + 'truncate'
                    }">
                        ${this.#user.fullName()}
                    </p>
                    <p
                        class="${
                            'text-xs '
                            + 'text-muted '
                            + 'truncate'
                        }">
                        ${this.#user.emailAddress()}
                    </p>
                </div>
            </div>
            <div class="flex-1">
                ${this.#buildRoleBadge()}
            </div>
            <div class="${
                'flex-1'
                + ' text-sm text-muted'
            }">
                ${this.#user.departmentLabel()}
            </div>
            <div class="flex-1">
                ${this.#buildStatusBadge()}
                <p class="${
                    'text-xs text-muted'
                    + ' mt-1'
                }">
                    ${this.#user.isPending()
                        ? 'Invite sent'
                        : 'Last active '
                            + formatDate(
                                this.#user
                                .lastActiveDate(),
                            )}
                </p>
            </div>
            <div class="flex-shrink-0">
                <button
                    class="${
                        'btn btn-ghost '
                        + 'btn-icon btn-sm'
                    }"
                    data-edit-user="${
                        this.#user.idForLink()
                    }">
                    ${iconStar(16, '')}
                </button>
            </div>
        </div>`;
    }

    #buildStatusBadge(): SafeHtml {
        if (this.#user.isActive())
            return html`<span
                class="${
                    'status-badge-success'
                }">
                ${iconCheckCircle2(14, '')}
                Active
            </span>`;
        if (this.#user.isPending())
            return html`<span
                class="${
                    'status-badge-warning'
                }">
                ${iconClock(14, '')}
                Pending
            </span>`;
        return html`<span
            class="${
                'status-badge-error'
            }">
            ${iconUserX(14, '')}
            Deactivated
        </span>`;
    }

    #buildRoleBadge(): SafeHtml {
        const cfg =
            ROLE_LABELS[this.#user.roleLabel()];
        if (!cfg)
            return html`<span
                class="${
                    'badge badge-secondary'
                }">
                ${this.#user.roleLabel()}
            </span>`;
        return html`<span
            class="${
                'badge badge-secondary'
            }">
            ${cfg.icon(12, '')}
            ${cfg.label}
        </span>`;
    }

    #buildDimensionsTab(): SafeHtml {
        return html`
        <div
            class="tabs mb-4"
            role="tablist"
        >
            <button
                class="tab active"
                role="tab"
                data-tab="dimensions"
            >Dimensions</button>
            <button
                class="tab"
                role="tab"
                data-tab="performance"
            >Performance</button>
        </div>
        <div
            id="tab-dimensions"
            class="tab-panel"
        >
            <p class="${
                'text-xs text-muted'
                + ' text-center mb-4'
            }">
                Team Dimensions Assessment
                Results
            </p>
            ${Object.entries(
                this.#user
                    .parsedTeamDimensions(),
            ).map(([key, value]) =>
                    html`
            <div class="user-dim-row">
                <div
                    class="${
                        'flex items-center'
                        + ' justify-between mb-2'
                    }"
                >
                    <div
                        class="${
                            'flex items-center'
                            + ' gap-2'
                        }"
                    >
                        ${(DIMENSION_ICONS[key]
                            ?? iconStar)(
                            16,
                            'text-primary',
                        )}
                        <span
                            class="${
                                'text-sm'
                                + ' font-medium'
                                + ' text-capitalize'
                            }"
                        >${key}</span>
                    </div>
                    <span
                        class="${
                            'text-sm '
                            + 'font-bold '
                            + 'text-primary'
                        }"
                    >${value}%</span>
                </div>
                <div
                    class="${
                        'progress'
                        + ' user-dim-progress'
                    }"
                >
                    <div
                        class="progress-fill"
                        style="${
                            '--progress-fill:'
                            + value + '%'
                        }"
                    ></div>
                </div>
            </div>
                `)}
        </div>`;
    }

    #buildPerformanceTab(): SafeHtml {
        return html`
        <div
            id="tab-performance"
            class="tab-panel hidden"
        >
            <div class="perf-hero">
                ${iconBarChart(
                    32, 'text-primary',
                )}
                <div
                    class="${
                        'text-3xl font-bold'
                        + ' text-primary'
                        + ' perf-hero-value'
                    }"
                >${
                    this.#user.performanceScoreValue()
                }%</div>
                <p class="${
                    'text-xs text-muted'
                }">
                    Overall Performance Score
                </p>
            </div>
            <div
                class="${
                    'grid grid-cols-2 gap-3'
                }"
            >
                <div class="perf-stat-cell">
                    ${iconCheckCircle2(
                        20, 'text-success',
                    )}
                    <div
                        class="${
                            'text-lg '
                            + 'font-bold '
                            + 'perf-stat-value'
                        }"
                    >${
                        this.#user
                            .projectsCompletedCount()
                    }</div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Completed
                    </p>
                </div>
                <div class="perf-stat-cell">
                    ${iconAlertCircle(
                        20, 'text-warning',
                    )}
                    <div
                        class="${
                            'text-lg '
                            + 'font-bold '
                            + 'perf-stat-value'
                        }"
                    >${
                        this.#user
                            .currentProjectsCount()
                    }</div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Active
                    </p>
                </div>
            </div>
        </div>`;
    }
}
