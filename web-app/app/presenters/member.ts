import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { initials } from '../core.ts';
import {
    iconCheckCircle2,
    iconClock,
    iconPersonX,
    iconBrain,
} from '../icons.ts';
import {
    HumanMember,
    AIMember,
    type Member,
    isHumanMember,
    isAIMember,
} from '../adapters/index.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import {
    findProviderModel,
} from '../../../api/provider-models.ts';

export type MemberKindFilter =
    | 'all'
    | 'human'
    | 'ai';

export class HumanMemberRowPresenter {
    readonly #member: HumanMember;

    constructor(member: HumanMember) {
        this.#member = member;
    }

    idForLink(): string {
        return this.#member.idForLink();
    }

    matchesSearch(query: string): boolean {
        if (query === '') return true;
        return this.#member
            .matchesSearch(query);
    }

    buildRow(isSelf: boolean = false): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
            + (this.#member.isArchived()
                ? ' opacity-50' : '')
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
                    ${initials(
                        this.#member.name(),
                    )}
                </span>
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    ${this.#member.name()}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${this.#member.emailAddress()}
                </p>
                <div class="${
                    'flex items-center gap-2 mt-1'
                }">
                    ${this.#buildTitleBadge()}
                    <span class="${
                        'text-xs text-muted'
                    }">
                        ${this.#member
                            .departmentLabel()}
                    </span>
                </div>
            </div>
            <div class="${
                'flex flex-col items-end gap-2'
                + ' ml-6'
            }">
                ${this.#buildStatusBadge()}
            </div>
        </div>`;
    }

    #buildStatusBadge(): SafeHtml {
        if (this.#member.isActive())
            return html`<span
                class="${
                    'status-badge-success'
                }">
                ${iconCheckCircle2(14, '')}
                Active
            </span>`;
        if (this.#member.isPending())
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
            ${iconPersonX(14, '')}
            Archived
        </span>`;
    }

    #buildTitleBadge(): SafeHtml {
        return html`<span
            class="${
                'badge badge-secondary'
            }">
            ${this.#member.titleLabel()}
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

    matchesSearch(query: string): boolean {
        if (query === '') return true;
        return this.#member
            .matchesSearch(query);
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
                    16,
                    'text-primary',
                )}
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    ${this.#member.nameText()}
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
                        )?.name ?? DISPLAY_ABSENT}
                    </span>
                </div>
            </div>
        </div>`;
    }
}

export type ManagedMembersState = {
    members: Member[];
    currentMemberId: string;
    search: string;
    kind: MemberKindFilter;
};

export function buildInitialManagedMembersState(
    members: Member[],
    currentMemberId: string,
): ManagedMembersState {
    return {
        members,
        currentMemberId,
        search: '',
        kind: 'all',
    };
}

export function applyManagedMembersSearch(
    state: ManagedMembersState,
    query: string,
): ManagedMembersState {
    return {
        ...state,
        search: query.toLowerCase(),
    };
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
    readonly #currentMemberId: string;
    readonly #search: string;
    readonly #kind: MemberKindFilter;

    constructor(state: ManagedMembersState) {
        this.#humans = state.members
            .filter(isHumanMember)
            .map(
                w => new HumanMemberRowPresenter(w),
            );
        this.#ais = state.members
            .filter(isAIMember)
            .map(
                w => new AIMemberRowPresenter(w),
            );
        this.#currentMemberId =
            state.currentMemberId;
        this.#search = state.search;
        this.#kind = state.kind;
    }

    humanCount(): number {
        return this.#humans.length;
    }

    aiCount(): number {
        return this.#ais.length;
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, html`${
            this.#buildSelfSection()
        }${
            this.#kind === 'ai'
                ? html``
                : this.#buildHumansSection()
        }${
            this.#kind === 'human'
                ? html``
                : this.#buildAIsSection()
        }`);
    }

    #buildSelfSection(): SafeHtml {
        if (this.#kind === 'ai') return html``;
        const self = this.#humans.find(
            p => p.idForLink()
                === this.#currentMemberId,
        );
        if (!self) return html``;
        if (!self.matchesSearch(this.#search)) {
            return html``;
        }
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
            )
            .filter(
                p => p.matchesSearch(this.#search),
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
        const filtered = this.#ais.filter(
            p => p.matchesSearch(this.#search),
        );
        return html`
            <div class="${
                'member-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">AIs</div>
            ${
                filtered.length === 0
                    ? this.#buildEmptyRow(
                        'No AIs match your'
                        + ' filter.',
                    )
                    : html`${filtered.map(
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
