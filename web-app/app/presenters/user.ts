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
} from '../../../api/types';

function styleForAvailability(
    availability: number,
): string {
    if (availability >= AVAILABILITY_HIGH)
        return 'background:'
            + 'hsl(var(--success-soft));'
            + 'color:'
            + 'hsl(var(--success-text))';
    if (availability >= AVAILABILITY_LOW)
        return 'background:'
            + 'hsl(var(--warning-soft));'
            + 'color:'
            + 'hsl(var(--warning-text))';
    return 'background:'
        + 'hsl(var(--error-soft));'
        + 'color:'
        + 'hsl(var(--error-text))';
}

function buildStatusDot(
    availability: number,
): SafeHtml {
    const color =
        availability >= AVAILABILITY_HIGH
            ? 'hsl(var(--success))'
            : availability >= AVAILABILITY_LOW
                ? 'hsl(var(--warning))'
                : 'hsl(var(--error))';
    return html`<div style="${
        'position:absolute;'
        + 'bottom:-2px;'
        + 'right:-2px;'
        + 'width:0.875rem;'
        + 'height:0.875rem;'
        + 'border-radius:9999px;'
        + 'border:2px solid '
        + 'hsl(var(--card));'
        + 'background:' + color
    }"></div>`;
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
    readonly #id: string;
    readonly #fullName: string;
    readonly #email: string;
    readonly #role: string;
    readonly #department: string;
    readonly #status: string;
    readonly #availability: number;
    readonly #performanceScore: number;
    readonly #projectsCompleted: number;
    readonly #currentProjects: number;
    readonly #lastActive: string;
    readonly #isActive: boolean;
    readonly #isPending: boolean;
    readonly #isDeactivated: boolean;
    readonly #strengths:
        readonly string[];
    readonly #teamDimensions:
        Record<string, number>;

    constructor(user: User) {
        this.#id = user.id;
        this.#fullName = user.fullName();
        this.#email = user.email;
        this.#role = user.role;
        this.#department = user.department;
        this.#status = user.status;
        this.#availability =
            user.availability;
        this.#performanceScore =
            user.performanceScore;
        this.#projectsCompleted =
            user.projectsCompleted;
        this.#currentProjects =
            user.currentProjects;
        this.#lastActive = user.lastActive;
        this.#isActive = user.isActive();
        this.#isPending = user.isPending();
        this.#isDeactivated =
            user.isDeactivated();
        this.#strengths =
            user.parsedStrengths();
        this.#teamDimensions =
            user.parsedTeamDimensions();
    }

    idForLink(): string {
        return this.#id;
    }

    matchesSearch(
        query: string,
    ): boolean {
        return this.#fullName
            .toLowerCase()
            .includes(query)
            || this.#role
                .toLowerCase()
                .includes(query)
            || this.#department
                .toLowerCase()
                .includes(query);
    }

    matchesUserSearch(
        query: string,
    ): boolean {
        return this.#fullName
            .toLowerCase()
            .includes(query)
            || this.#email
                .toLowerCase()
                .includes(query);
    }

    matchesRoleFilter(
        role: string,
    ): boolean {
        return role === 'all'
            || this.#role === role;
    }

    matchesStatusFilter(
        status: string,
    ): boolean {
        return status === 'all'
            || this.#status === status;
    }

    buildMemberCard(
        selectedId: string | null,
    ): SafeHtml {
        const cardStyle =
            selectedId === this.#id
                ? 'box-shadow:0 0 0 2px'
                  + ' hsl(var(--primary))'
                : '';
        return html`
    <div
        class="card card-hover"
        style="padding:1.25rem;
            cursor:pointer;${cardStyle}"
        data-member-card="${this.#id}"
    >
        <div class="flex items-start gap-4">
            <div
                style="position:relative;
                    flex-shrink:0"
            >
                <div
                    style="${
                        'width:3.5rem;'
                        + 'height:3.5rem;'
                        + 'border-radius:'
                        + '0.75rem;'
                        + 'background:'
                        + 'linear-gradient('
                        + '135deg,'
                        + 'hsl(var(--primary)'
                        + '/0.2),'
                        + 'hsl(var(--primary)'
                        + '/0.05));'
                        + 'display:flex;'
                        + 'align-items:center;'
                        + 'justify-content:'
                        + 'center'
                    }"
                >
                    <span
                        class="${
                            'text-lg font-bold'
                            + ' text-primary'
                        }"
                    >${
                        initials(
                            this.#fullName,
                        )
                    }</span>
                </div>
                ${buildStatusDot(
                    this.#availability,
                )}
            </div>
            <div style="flex:1;min-width:0">
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
                        ${this.#fullName}
                    </h3>
                    <span
                        class="pill"
                        style="${
                            styleForAvailability(
                                this
                                .#availability,
                            )
                        }"
                    >${
                        this.#availability
                    }%</span>
                </div>
                <p class="${
                    'text-xs text-muted mb-2'
                }">
                    ${this.#role}
                    \u2022 ${this.#department}
                </p>
                <div
                    class="${
                        'flex flex-wrap'
                        + ' gap-1.5 mb-2'
                    }"
                >
                    ${this.#strengths
                        .slice(0, 3)
                        .map(s => html`
                    <span
                        class="pill-tag"
                        style="${
                            'background:'
                            + 'hsl(var(--muted)'
                            + '/0.5);'
                            + 'font-size:'
                            + '0.625rem'
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
                        ${this
                            .#performanceScore}%
                    </span>
                    <span
                        class="${
                            'flex items-center'
                            + ' gap-1'
                        }"
                    >
                        ${iconBriefcase(14, '')}
                        ${this
                            .#currentProjects
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
                        ${this
                            .#projectsCompleted}
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
    <div style="padding:1.5rem">
        <div
            style="text-align:center;
                margin-bottom:1.5rem"
        >
            <div
                style="${
                    'width:5rem;height:5rem;'
                    + 'border-radius:1rem;'
                    + 'background:'
                    + 'linear-gradient('
                    + '135deg,'
                    + 'hsl(var(--primary)'
                    + '/0.2),'
                    + 'hsl(var(--primary)'
                    + '/0.05));'
                    + 'display:flex;'
                    + 'align-items:center;'
                    + 'justify-content:'
                    + 'center;'
                    + 'margin:0 auto 1rem'
                }"
            >
                <span
                    class="${
                        'text-2xl font-bold'
                        + ' text-primary'
                    }"
                >${
                    initials(
                        this.#fullName,
                    )
                }</span>
            </div>
            <h3
                class="${
                    'text-lg font-display'
                    + ' font-semibold'
                }"
            >${this.#fullName}</h3>
            <p class="text-sm text-muted">
                ${this.#role}
            </p>
            <p class="text-xs text-muted">
                ${this.#email}
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
            + 'gap-4 p-4 '
            + (this.#isDeactivated
                ? 'opacity-50' : '')
        }"
            style="${
                'border-bottom:'
                + '1px solid '
                + 'hsl(var(--border))'
            }">
            <div style="${
                'flex:2;display:flex;'
                + 'align-items:center;'
                + 'gap:0.75rem;'
                + 'min-width:0'
            }">
                <div style="${
                    'width:2.5rem;'
                    + 'height:2.5rem;'
                    + 'border-radius:'
                    + '9999px;'
                    + 'background:'
                    + 'linear-gradient('
                    + '135deg,'
                    + 'hsl(var(--primary)'
                    + '/0.2),'
                    + 'hsl(var(--primary)'
                    + '/0.05));'
                    + 'display:flex;'
                    + 'align-items:center;'
                    + 'justify-content:'
                    + 'center;'
                    + 'flex-shrink:0'
                }">
                    <span
                        class="${
                            'text-sm '
                            + 'font-bold '
                            + 'text-primary'
                        }">
                        ${initials(
                            this.#fullName,
                        )}
                    </span>
                </div>
                <div style="${
                    'min-width:0'
                }">
                    <p class="${
                        'font-medium '
                        + 'truncate'
                    }">
                        ${this.#fullName}
                    </p>
                    <p
                        class="${
                            'text-xs '
                            + 'text-muted '
                            + 'truncate'
                        }">
                        ${this.#email}
                    </p>
                </div>
            </div>
            <div style="flex:1">
                ${this.#buildRoleBadge()}
            </div>
            <div style="flex:1"
                class="${
                    'text-sm text-muted'
                }">
                ${this.#department}
            </div>
            <div style="flex:1">
                ${this.#buildStatusBadge()}
                <p class="${
                    'text-xs text-muted'
                    + ' mt-1'
                }">
                    ${this.#isPending
                        ? 'Invite sent'
                        : 'Last active '
                            + formatDate(
                                this
                                .#lastActive,
                            )}
                </p>
            </div>
            <div style="${
                'flex:0 0 auto'
            }">
                <button
                    class="${
                        'btn btn-ghost '
                        + 'btn-icon btn-sm'
                    }"
                    data-edit-user="${
                        this.#id
                    }">
                    ${iconStar(16, '')}
                </button>
            </div>
        </div>`;
    }

    #buildStatusBadge(): SafeHtml {
        if (this.#isActive)
            return html`<span
                class="${
                    'status-badge-success'
                }">
                ${iconCheckCircle2(14, '')}
                Active
            </span>`;
        if (this.#isPending)
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
            ROLE_LABELS[this.#role];
        if (!cfg)
            return html`<span
                class="${
                    'badge badge-secondary'
                }">
                ${this.#role}
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
            class="tabs"
            role="tablist"
            style="margin-bottom:1rem"
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
            <p
                class="text-xs text-muted"
                style="${
                    'text-align:center;'
                    + 'margin-bottom:1rem'
                }"
            >
                Team Dimensions Assessment
                Results
            </p>
            ${Object.entries(
                this.#teamDimensions,
            ).map(([key, value]) =>
                    html`
            <div style="${
                'margin-bottom:1rem'
            }">
                <div
                    class="${
                        'flex items-center'
                        + ' justify-between'
                    }"
                    style="${
                        'margin-bottom:'
                        + '0.5rem'
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
                            }"
                            style="${
                                'text-transform'
                                + ':capitalize'
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
                    class="progress"
                    style="height:0.5rem"
                >
                    <div
                        class="progress-fill"
                        style="${
                            'width:' + value
                            + '%'
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
            class="tab-panel"
            style="display:none"
        >
            <div
                style="${
                    'padding:1rem;'
                    + 'border-radius:0.75rem;'
                    + 'background:'
                    + 'linear-gradient('
                    + '135deg,'
                    + 'hsl(var(--primary)'
                    + '/0.1),'
                    + 'hsl(var(--primary)'
                    + '/0.05));'
                    + 'text-align:center;'
                    + 'margin-bottom:1rem'
                }"
            >
                ${iconBarChart(
                    32, 'text-primary',
                )}
                <div
                    class="${
                        'text-3xl font-bold'
                        + ' text-primary'
                    }"
                    style="${
                        'margin:0.5rem 0'
                    }"
                >${
                    this.#performanceScore
                }%</div>
                <p class="${
                    'text-xs text-muted'
                }">
                    Overall Performance Score
                </p>
            </div>
            <div
                style="${
                    'display:grid;'
                    + 'grid-template-columns'
                    + ':1fr 1fr;'
                    + 'gap:0.75rem'
                }"
            >
                <div
                    style="${
                        'padding:0.75rem;'
                        + 'border-radius:'
                        + '0.5rem;'
                        + 'background:'
                        + 'hsl(var(--muted)'
                        + '/0.3);'
                        + 'text-align:center'
                    }"
                >
                    ${iconCheckCircle2(
                        20, 'text-success',
                    )}
                    <div
                        class="${
                            'text-lg '
                            + 'font-bold'
                        }"
                        style="${
                            'margin:'
                            + '0.25rem 0'
                        }"
                    >${
                        this
                            .#projectsCompleted
                    }</div>
                    <p class="${
                        'text-xs text-muted'
                    }">
                        Completed
                    </p>
                </div>
                <div
                    style="${
                        'padding:0.75rem;'
                        + 'border-radius:'
                        + '0.5rem;'
                        + 'background:'
                        + 'hsl(var(--muted)'
                        + '/0.3);'
                        + 'text-align:center'
                    }"
                >
                    ${iconAlertCircle(
                        20, 'text-warning',
                    )}
                    <div
                        class="${
                            'text-lg '
                            + 'font-bold'
                        }"
                        style="${
                            'margin:'
                            + '0.25rem 0'
                        }"
                    >${
                        this
                            .#currentProjects
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
