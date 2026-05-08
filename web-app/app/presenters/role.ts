import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import {
    iconShield, iconTrash,
} from '../icons.ts';
import type {
    Id,
    Role,
    RoleMembershipEntity,
} from '../adapters/index.ts';

export class RolePresenter {
    readonly #role: Role;
    readonly #memberCount: number;

    constructor(
        role: Role, memberCount: number,
    ) {
        this.#role = role;
        this.#memberCount = memberCount;
    }

    idForLink(): string {
        return this.#role.idForLink();
    }

    nameText(): string {
        return this.#role.nameText();
    }

    descriptionText(): string {
        return this.#role.descriptionText();
    }

    memberCount(): number {
        return this.#memberCount;
    }

    matchesSearch(query: string): boolean {
        const q = query.trim().toLowerCase();
        if (q === '') return true;
        return this.#role.nameText()
            .toLowerCase().includes(q)
            || this.#role.descriptionText()
                .toLowerCase().includes(q);
    }

    buildRow(): SafeHtml {
        const members = this.#memberCount;
        const memberLabel = members === 1
            ? '1 member'
            : `${members} members`;
        return html`
        <div class="${
            'flex items-center gap-4 p-4'
            + ' role-list-row'
        }"
            data-role-id="${
                this.#role.idForLink()
            }">
            <div class="role-list-icon">
                ${iconShield(20, '')}
            </div>
            <div class="flex-2 min-w-0">
                <p class="${
                    'font-medium truncate'
                }">${this.#role.nameText()}</p>
                <p class="${
                    'text-xs text-muted truncate'
                }">${
                    this.#role.descriptionText()
                }</p>
            </div>
            <div class="${
                'flex-1 text-sm text-muted'
            }">${memberLabel}</div>
            <div class="table-action-cell">
                <button class="${
                    'btn btn-ghost btn-icon'
                }"
                    data-role-action="delete"
                    data-role-id="${
                        this.#role.idForLink()
                    }"
                    aria-label="Delete role">
                    ${iconTrash(16, '')}
                </button>
            </div>
        </div>`;
    }
}

export type RoleListState = {
    roles: Role[];
    memberCounts: Map<Id, number>;
    search: string;
};

function buildMemberCounts(
    memberships: RoleMembershipEntity[],
): Map<Id, number> {
    const counts = new Map<Id, number>();
    for (const m of memberships) {
        counts.set(
            m.role_id,
            (counts.get(m.role_id) ?? 0) + 1,
        );
    }
    return counts;
}

export function buildInitialRoleListState(
    roles: Role[],
    memberships: RoleMembershipEntity[],
): RoleListState {
    return {
        roles,
        memberCounts: buildMemberCounts(
            memberships,
        ),
        search: '',
    };
}

export function applyRoleListSearch(
    s: RoleListState, q: string,
): RoleListState {
    return { ...s, search: q };
}

export function applyRoleListUpdate(
    s: RoleListState,
    roles: Role[],
    memberships: RoleMembershipEntity[],
): RoleListState {
    return {
        ...s,
        roles,
        memberCounts: buildMemberCounts(
            memberships,
        ),
    };
}

export class RoleListPresenter {
    readonly #presenters: RolePresenter[];
    readonly #search: string;

    constructor(state: RoleListState) {
        this.#presenters = state.roles.map(
            r => new RolePresenter(
                r,
                state.memberCounts.get(
                    r.idForLink(),
                ) ?? 0,
            ),
        );
        this.#search = state.search;
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, this.#buildList());
    }

    #buildList(): SafeHtml {
        const filtered = this.#presenters
            .filter(p => p.matchesSearch(
                this.#search,
            ))
            .toSorted((a, b) =>
                a.nameText().localeCompare(
                    b.nameText(),
                ),
            );
        if (filtered.length === 0) {
            return html`<div class="${
                'p-6 text-sm text-muted'
                + ' text-center'
            }">No roles match your
                search.</div>`;
        }
        return html`${
            filtered.map(p => p.buildRow())
        }`;
    }
}
