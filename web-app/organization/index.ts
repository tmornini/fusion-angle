import { $, $$, attr } from '../app/dom';
import {
    html, setHtml, SafeHtml, trusted,
} from '../app/safe-html';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    iconUser, iconSettings, iconCreditCard,
    iconBuilding, iconCrown, iconCheckCircle2,
    iconActivity, iconUsers, iconFolderKanban,
    iconLightbulb, iconCalendar,
    iconTrendingUp, iconExternalLink,
} from '../app/icons';
import {
    navigateTo, formatDate,
} from '../app/core';
import {
    getAccount,
    type Account,
} from '../app/adapters';

function styleForUsageLevel(
    current: number,
    limit: number,
): string {
    const percentage =
        (current / limit) * 100;
    if (percentage >= 90) {
        return 'background:hsl(var(--error))';
    }
    if (percentage >= 70) {
        return 'background:'
            + 'hsl(var(--warning))';
    }
    return 'background:hsl(var(--primary))';
}

function buildUsageBar(
    label: string,
    current: number,
    limit: number,
): SafeHtml {
    const percentage = Math.min(
        100, (current / limit) * 100,
    );
    return html`
    <div>
        <div
            class="flex items-center
                   justify-between text-sm mb-1"
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
                style="width:${percentage}%;${
                        styleForUsageLevel(
                                current, limit,
                        )}"
            ></div>
        </div>
    </div>`;
}

export async function init(): Promise<void> {
    const container = $('#account-content', document);
    if (!container) return;

    setHtml(container, buildSkeleton('detail', 4));

    let account: Account;
    try {
        account = await getAccount();
    } catch {
        setHtml(
            container,
            buildErrorState(
                'Failed to load account data.',
                'Try Again',
            ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                'click', () => init(),
            );
        return;
    }

    const billingDate = formatDate(
        account.nextBilling,
    );

    setHtml(container, html`
    <div style="max-width:64rem;margin:0 auto">
        <div class="mb-8">
            <h1
                class="text-3xl font-display
                       font-bold mb-2"
            >Administration</h1>
            <p class="text-muted">
                ${'Manage your organization,'
                    + ' users, and billing'}
            </p>
        </div>

        <!-- Quick Actions -->
        <div
            class="grid grid-cols-1
                   sm:grid-cols-3 gap-4 mb-8"
        >
            <button
                class="btn btn-outline"
                style="height:auto;
                       padding:0.75rem 1rem;
                       justify-content:flex-start;
                       gap:0.75rem"
                data-nav-to="profile"
            >
                <div
                    style="width:2.5rem;height:2.5rem;
                           border-radius:var(
                           --radius-lg);
                           background:hsl(var(
                           --primary) / 0.1);
                           display:flex;
                           align-items:center;
                           justify-content:center;
                           color:hsl(var(--primary))"
                >${iconUser(20, '')}</div>
                <div class="text-left">
                    <p class="font-medium text-sm">
                        My Profile
                    </p>
                    <p class="text-xs text-muted">
                        Personal settings
                    </p>
                </div>
            </button>
            <button
                class="btn btn-outline"
                style="height:auto;
                       padding:0.75rem 1rem;
                       justify-content:flex-start;
                       gap:0.75rem"
                data-nav-to="settings"
            >
                <div
                    style="width:2.5rem;height:2.5rem;
                           border-radius:var(
                           --radius-lg);
                           background:hsl(var(
                           --info-soft));display:flex;
                           align-items:center;
                           justify-content:center;
                           color:hsl(var(
                           --info-text))"
                >${iconSettings(20, '')}</div>
                <div class="text-left">
                    <p class="font-medium text-sm">
                        Company Settings
                    </p>
                    <p class="text-xs text-muted">
                        Organization config
                    </p>
                </div>
            </button>
            <button
                class="btn btn-outline"
                style="height:auto;
                       padding:0.75rem 1rem;
                       justify-content:flex-start;
                       gap:0.75rem"
            >
                <div
                    style="width:2.5rem;height:2.5rem;
                           border-radius:var(
                           --radius-lg);
                           background:hsl(var(
                           --success-soft));
                           display:flex;
                           align-items:center;
                           justify-content:center;
                           color:hsl(var(
                           --success-text))"
                >${iconCreditCard(20, '')}</div>
                <div class="text-left">
                    <p class="font-medium text-sm">
                        Billing
                    </p>
                    <p class="text-xs text-muted">
                        Plans & invoices
                    </p>
                </div>
            </button>
        </div>

        <!-- Company Overview -->
        <div class="card card-hover p-6 mb-6">
            <div
                class="flex items-center
                       justify-between gap-4 mb-6"
                style="flex-wrap:wrap"
            >
                <div
                    class="flex items-center gap-4"
                    style="flex:1"
                >
                    <div
                        style="width:3.5rem;
                               height:3.5rem;
                               border-radius:var(
                               --radius-xl);
                               background:
                               linear-gradient(135deg,
                               hsl(var(--primary) / 0.2),
                               hsl(var(--primary)
                               / 0.05));display:flex;
                               align-items:center;
                               justify-content:center;
                               color:hsl(var(
                               --primary))"
                    >${iconBuilding(28, '')}</div>
                    <div>
                        <h2
                            class="text-xl font-display
                                   font-semibold"
                        >${account.companyName}</h2>
                        <div
                            class="flex items-center
                                   gap-2 mt-1"
                        >
                            <span
                                class="badge badge-default
                                       text-xs"
                            >
                                ${iconCrown(12, '')}
                                ${account.plan} Plan
                            </span>
                            <span
                                class="status-badge-success"
                            >
                                ${iconCheckCircle2(12, '')}
                                Active
                            </span>
                        </div>
                    </div>
                </div>
                <div
                    class="status-badge-success"
                    style="padding:0.5rem 1rem;
                           align-self:flex-start"
                >
                    <div
                        class="flex items-center gap-2"
                    >
                        ${iconActivity(16, '')}
                        <span class="text-sm font-medium">
                            ${account.healthStatus}
                        </span>
                    </div>
                    <p class="text-xs mt-1">
                        ${'Health Score: '
                            + account.healthScore + '%'}
                    </p>
                </div>
            </div>

            <div
                class="grid grid-cols-2
                       lg:grid-cols-4 gap-4"
            >
                <div
                    class="p-4 rounded-lg"
                    style="background:hsl(var(
                           --muted) / 0.3)"
                >
                    <div
                        class="flex items-center gap-2
                               text-muted mb-1"
                    >
                        ${iconUsers(16, '')}
                        <span class="text-xs">
                            Active Users
                        </span>
                    </div>
                    <p class="text-2xl font-bold">
                        ${account.usedSeats}<span
                            class="text-sm font-normal
                                   text-muted"
                        >/${account.seats}</span>
                    </p>
                </div>
                <div
                    class="p-4 rounded-lg"
                    style="background:hsl(var(
                           --muted) / 0.3)"
                >
                    <div
                        class="flex items-center gap-2
                               text-muted mb-1"
                    >
                        ${iconFolderKanban(16, '')}
                        <span class="text-xs">
                            Projects
                        </span>
                    </div>
                    <p class="text-2xl font-bold">
                        ${account.projectsCurrent}
                    </p>
                </div>
                <div
                    class="p-4 rounded-lg"
                    style="background:hsl(var(
                           --muted) / 0.3)"
                >
                    <div
                        class="flex items-center gap-2
                               text-muted mb-1"
                    >
                        ${iconLightbulb(16, '')}
                        <span class="text-xs">
                            Ideas
                        </span>
                    </div>
                    <p class="text-2xl font-bold">
                        ${account.ideasCurrent}
                    </p>
                </div>
                <div
                    class="p-4 rounded-lg"
                    style="background:hsl(var(
                           --muted) / 0.3)"
                >
                    <div
                        class="flex items-center gap-2
                               text-muted mb-1"
                    >
                        ${iconCalendar(16, '')}
                        <span class="text-xs">
                            Next Billing
                        </span>
                    </div>
                    <p class="text-lg font-bold">
                        ${billingDate}
                    </p>
                </div>
            </div>
        </div>

        <!-- Usage Overview -->
        <div class="card card-hover p-6">
            <h3
                class="font-display font-semibold
                       mb-4 flex items-center gap-2"
            >
                ${iconTrendingUp(20, '')}
                Usage Overview
            </h3>
            <div class="flex flex-col gap-4">
                ${buildUsageBar(
                        'User Seats',
                        account.usedSeats,
                        account.seats,
                )}
                ${buildUsageBar(
                        'Projects',
                        account.projectsCurrent,
                        account.projectsLimit,
                )}
                ${buildUsageBar(
                        'Ideas',
                        account.ideasCurrent,
                        account.ideasLimit,
                )}
                ${buildUsageBar(
                        'AI Credits',
                        account.aiCreditsCurrent,
                        account.aiCreditsLimit,
                )}
                ${buildUsageBar(
                        'Storage (GB)',
                        account.storageCurrent,
                        account.storageLimit,
                )}
            </div>
        </div>

        <!-- Admin Links -->
        <div class="card card-hover p-6 mt-6">
            <h3
                class="font-display font-semibold
                       mb-4"
            >Security & Administration</h3>
            <div
                class="grid grid-cols-1
                       sm:grid-cols-3 gap-4"
            >
                <button
                    class="admin-link-card"
                    data-nav-to="users"
                >
                    <span
                        style="color:hsl(var(
                               --muted-foreground))"
                    >${iconUsers(20, '')}</span>
                    <div style="flex:1;min-width:0">
                        <p class="font-medium text-sm">
                            Users
                        </p>
                        <p
                            class="text-xs text-muted
                                   truncate"
                        >
                            ${'Add, edit, or remove'
                                + ' team members'}
                        </p>
                    </div>
                    ${iconExternalLink(16, '')}
                </button>
                <button class="admin-link-card">
                    <span
                        style="color:hsl(var(
                               --muted-foreground))"
                    >${iconCreditCard(20, '')}</span>
                    <div style="flex:1;min-width:0">
                        <p class="font-medium text-sm">
                            Billing History
                        </p>
                        <p
                            class="text-xs text-muted
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
    </div>`);

    $$('[data-nav-to]', document).forEach(
        navButton => {
            navButton.addEventListener(
                'click',
                () => navigateTo(
                    attr(
                        navButton,
                        'data-nav-to',
                    ),
                ),
            );
        },
    );
}
