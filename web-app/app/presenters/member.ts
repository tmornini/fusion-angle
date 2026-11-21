import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import {
    formatDate, initials,
} from '../format.ts';
import {
    ICON_SIZE,
    iconBrain,
    iconMonitor,
} from '../icons.ts';
import { MEMBER_WITHOUT_PII_NAME } from '../../../client/index.ts';
import {
    FormerMember,
    HumanMember,
    AIMember,
    ServiceMember,
    type Id,
    type Member,
    isFormerMember,
    isHumanMember,
    isAIMember,
    isServiceMember,
} from '../../../shared/types.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import { buildPageUrl } from '../navigation.ts';
import {
    findProviderModel,
} from '../../../api/provider-models.ts';

export type MemberKindFilter =
    | 'all'
    | 'human'
    | 'ai'
    | 'service';

export class HumanMemberRowPresenter {
    readonly #member: HumanMember;

    constructor(member: HumanMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    buildRow(isSelf: boolean = false): SafeHtml {
        const pii = this.#member.pii();
        const profile = this.#member.profile();
        const name = pii.erased
            ? MEMBER_WITHOUT_PII_NAME
            : pii.name;
        const email = pii.erased
            ? DISPLAY_ABSENT
            : pii.email;
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
        }"
            data-self="${
                isSelf ? 'true' : 'false'
            }"
            data-member-id="${
                this.#member.idForLink()
            }">
            <div class="${
                'avatar avatar-tinted'
            }">
                <span class="${
                    'text-sm font-bold'
                    + ' text-primary'
                }">
                    ${initials(name)}
                </span>
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    <a href="${
                        buildPageUrl(
                            'member-detail',
                            {
                                memberId: this
                                    .#member
                                    .idForLink(),
                            },
                        )
                    }">${name}</a>
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${email}
                </p>
                <div class="${
                    'flex items-center gap-2 mt-1'
                }">
                    ${this.#buildTitleBadge(
                        profile.present ? profile.title : '',
                    )}
                    <span class="${
                        'text-xs text-muted'
                    }">
                        ${profile.present ? profile.department : ''}
                    </span>
                </div>
            </div>
        </div>`;
    }

    #buildTitleBadge(title: string): SafeHtml {
        return html`<span
            class="${
                'badge badge-secondary'
            }">
            ${title}
        </span>`;
    }
}

export class AIMemberRowPresenter {
    readonly #member: AIMember;

    constructor(member: AIMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    buildRow(): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
        }"
            data-member-id="${
                this.#member.idForLink()
            }">
            <div class="${
                'avatar avatar-tinted'
            }">
                ${iconBrain(
                    ICON_SIZE.base,
                    'text-primary',
                )}
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    <a href="${
                        buildPageUrl(
                            'member-detail',
                            {
                                memberId: this
                                    .#member
                                    .idForLink(),
                            },
                        )
                    }">${
                        this.#member.nameText()
                    }</a>
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${
                        this.#member
                            .descriptionText()
                    }
                </p>
                <div class="${
                    'flex items-center gap-2 mt-1'
                }">
                    <span class="${
                        'badge badge-secondary'
                    }">
                        ${findProviderModel(
                            this.#member.modelId(),
                        )!.name}
                    </span>
                </div>
            </div>
        </div>`;
    }
}

export class ServiceMemberRowPresenter {
    readonly #member: ServiceMember;

    constructor(member: ServiceMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    buildRow(): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
        }"
            data-member-id="${
                this.#member.idForLink()
            }">
            <div class="${
                'avatar avatar-tinted'
            }">
                ${iconMonitor(
                    ICON_SIZE.base,
                    'text-primary',
                )}
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    <a href="${
                        buildPageUrl(
                            'member-detail',
                            {
                                memberId: this
                                    .#member
                                    .idForLink(),
                            },
                        )
                    }">${
                        this.#member.nameText()
                    }</a>
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${
                        this.#member
                            .descriptionText()
                    }
                </p>
            </div>
        </div>`;
    }
}

export class FormerMemberRowPresenter {
    readonly #member: FormerMember;

    constructor(member: FormerMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    buildRow(): SafeHtml {
        return html`
        <div class="member-row-former">
            <p class="font-medium truncate">
                ${this.#member.name()}
            </p>
            <p class="text-xs truncate">
                ${formatDate(this.#member.at())}
            </p>
        </div>`;
    }
}

// What the box narrows the roster to: nothing while it is
// empty, else its QUERY's answer.
export type MemberSearch =
    | { readonly kind: 'none' }
    | {
        readonly kind: 'matched',
        readonly text: string,
        // identity ids in best-match order
        readonly identityIds: readonly Id[],
    };

export type ManagedMembersState = {
    members: Member[];
    currentMemberId: string;
    search: MemberSearch;
    kind: MemberKindFilter;
    membership: 'accepted' | 'removed';
};

export function buildInitialManagedMembersState(
    members: Member[],
    currentMemberId: string,
): ManagedMembersState {
    return {
        members,
        currentMemberId,
        search: { kind: 'none' },
        kind: 'all',
        membership: 'accepted',
    };
}

export function applyManagedMembersSearch(
    state: ManagedMembersState,
    search: MemberSearch,
): ManagedMembersState {
    return { ...state, search };
}

// While matched, the rows the answer names, in its order.
function searchedRows<Row extends { idForLink(): string }>(
    rows: readonly Row[],
    search: MemberSearch,
): Row[] {
    if (search.kind === 'none') return [...rows];
    const byId = new Map(
        rows.map(row => [row.idForLink(), row]),
    );
    return search.identityIds.flatMap(id => {
        const row = byId.get(id);
        return row === undefined ? [] : [row];
    });
}

export function applyManagedMembersKind(
    state: ManagedMembersState,
    kind: MemberKindFilter,
): ManagedMembersState {
    return { ...state, kind };
}

export class ManagedMembersPresenter {
    readonly #humans: HumanMemberRowPresenter[];
    readonly #ais: AIMemberRowPresenter[];
    readonly #services: ServiceMemberRowPresenter[];
    readonly #formers: FormerMemberRowPresenter[];
    readonly #currentMemberId: string;
    readonly #kind: MemberKindFilter;
    readonly #membership: ManagedMembersState['membership'];

    constructor(state: ManagedMembersState) {
        this.#humans = searchedRows(
            state.members
                .filter(isHumanMember)
                .map(
                    w => new HumanMemberRowPresenter(w),
                ),
            state.search,
        );
        this.#ais = searchedRows(
            state.members
                .filter(isAIMember)
                .map(
                    w => new AIMemberRowPresenter(w),
                ),
            state.search,
        );
        this.#services = searchedRows(
            state.members
                .filter(isServiceMember)
                .map(
                    w => new ServiceMemberRowPresenter(w),
                ),
            state.search,
        );
        this.#formers = searchedRows(
            state.members
                .filter(isFormerMember)
                .map(
                    member =>
                        new FormerMemberRowPresenter(member),
                ),
            state.search,
        );
        this.#currentMemberId =
            state.currentMemberId;
        this.#kind = state.kind;
        this.#membership = state.membership;
    }

    renderList(
        container: HTMLElement,
    ): void {
        if (this.#membership === 'removed') {
            setHtml(container, html`${
                this.#formers.map(
                    row => row.buildRow(),
                )
            }`);
            return;
        }
        setHtml(container, html`${
            this.#buildSelfSection()
        }${
            this.#kind === 'all' || this.#kind === 'human'
                ? this.#buildHumansSection()
                : html``
        }${
            this.#kind === 'all' || this.#kind === 'ai'
                ? this.#buildAIsSection()
                : html``
        }${
            this.#kind === 'all' || this.#kind === 'service'
                ? this.#buildServicesSection()
                : html``
        }`);
    }

    #buildSelfSection(): SafeHtml {
        if (this.#kind === 'ai' || this.#kind === 'service') {
            return html``;
        }
        const self = this.#humans.find(
            p => p.idForLink()
                === this.#currentMemberId,
        );
        if (!self) return html``;
        return html`
            <div class="${
                'member-section-header'
                + ' text-xs font-semibold'
                + ' text-muted'
            }">YOU</div>
            ${self.buildRow(true)}`;
    }

    #buildHumansSection(): SafeHtml {
        const others = this.#humans
            .filter(
                p => p.idForLink()
                    !== this.#currentMemberId,
            );
        return html`
            <div class="${
                'member-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">HUMANS</div>
            ${
                others.length === 0
                    ? this.#buildEmptyRow(
                        'No humans match'
                        + ' your filter.',
                    )
                    : html`${others.map(
                        p => p.buildRow(false),
                    )}`
            }`;
    }

    #buildAIsSection(): SafeHtml {
        return html`
            <div class="${
                'member-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">AIs</div>
            ${
                this.#ais.length === 0
                    ? this.#buildEmptyRow(
                        'No AIs match your'
                        + ' filter.',
                    )
                    : html`${this.#ais.map(
                        p => p.buildRow(),
                    )}`
            }`;
    }

    #buildServicesSection(): SafeHtml {
        return html`
            <div class="${
                'member-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">SERVICES</div>
            ${
                this.#services.length === 0
                    ? this.#buildEmptyRow(
                        'No services match your'
                        + ' filter.',
                    )
                    : html`${this.#services.map(
                        p => p.buildRow(),
                    )}`
            }`;
    }

    #buildEmptyRow(message: string): SafeHtml {
        return html`<div class="${
            'p-4 text-sm text-muted'
            + ' text-center'
        }">${message}</div>`;
    }
}
