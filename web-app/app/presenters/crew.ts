import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import {
    iconBriefcase,
    iconChevronRight,
    iconChevronDown,
    iconTrash,
    iconPlus,
} from '../icons.ts';
import {
    isUserPrivateRoleId,
    personIdFromUserPrivateRoleId,
    userPrivateRoleFor,
} from '../adapters/index.ts';
import type {
    Id,
    Crew,
    Role,
    Person,
    CrewRoleMembershipEntity,
} from '../adapters/index.ts';

export interface CrewRoleMember {
    readonly membershipId: Id;
    readonly role: Role;
}

export class CrewPresenter {
    readonly #crew: Crew;
    readonly #members: CrewRoleMember[];
    readonly #availableRoles: Role[];
    readonly #isExpanded: boolean;

    constructor(
        crew: Crew,
        members: CrewRoleMember[],
        availableRoles: Role[],
        isExpanded: boolean,
    ) {
        this.#crew = crew;
        this.#members = members;
        this.#availableRoles = availableRoles;
        this.#isExpanded = isExpanded;
    }

    idForLink(): string {
        return this.#crew.idForLink();
    }

    nameText(): string {
        return this.#crew.nameText();
    }

    descriptionText(): string {
        return this.#crew.descriptionText();
    }

    isExpanded(): boolean {
        return this.#isExpanded;
    }

    roleCount(): number {
        return this.#members.length;
    }

    matchesSearch(query: string): boolean {
        const q = query.trim().toLowerCase();
        if (q === '') return true;
        return this.#crew.nameText()
            .toLowerCase().includes(q)
            || this.#crew.descriptionText()
                .toLowerCase().includes(q);
    }

    buildRow(): SafeHtml {
        const roleCount = this.#members.length;
        const roleLabel = roleCount === 1
            ? '1 role'
            : `${roleCount} roles`;
        const chevron = this.#isExpanded
            ? iconChevronDown(20, '')
            : iconChevronRight(20, '');
        return html`
        <div class="crew-list-row-wrap"
            data-crew-id="${
                this.#crew.idForLink()
            }">
            <div class="${
                'flex items-center gap-4 p-4'
                + ' crew-list-row cursor-pointer'
            }"
                data-crew-action="toggle"
                data-crew-id="${
                    this.#crew.idForLink()
                }">
                <div class="crew-list-icon">
                    ${iconBriefcase(20, '')}
                </div>
                <div class="flex-2 min-w-0">
                    <p class="${
                        'font-medium truncate'
                    }">${this.#crew.nameText()}</p>
                    <p class="${
                        'text-xs text-muted'
                        + ' truncate'
                    }">${
                        this.#crew
                            .descriptionText()
                    }</p>
                </div>
                <div class="${
                    'flex-1 text-sm text-muted'
                }">${roleLabel}</div>
                <div class="${
                    'crew-list-chevron'
                }">${chevron}</div>
                <div class="${
                    'table-action-cell'
                }">
                    <button class="${
                        'btn btn-ghost btn-icon'
                    }"
                        data-crew-action="${
                            'delete'
                        }"
                        data-crew-id="${
                            this.#crew.idForLink()
                        }"
                        aria-label="${
                            'Delete crew'
                        }">
                        ${iconTrash(16, '')}
                    </button>
                </div>
            </div>
            ${this.#isExpanded
                ? this.#buildExpansion()
                : html``}
        </div>`;
    }

    #buildExpansion(): SafeHtml {
        return html`
        <div class="${
            'crew-expansion p-4'
        }"
            data-crew-id="${
                this.#crew.idForLink()
            }">
            ${this.#buildMembersList()}
            ${this.#buildAddRoleSelect()}
        </div>`;
    }

    #buildMembersList(): SafeHtml {
        if (this.#members.length === 0) {
            return html`<p class="${
                'text-sm text-muted mb-3'
            }">
                No roles in this crew yet.
            </p>`;
        }
        return html`<ul class="${
            'stack-sm mb-3'
        }">
            ${this.#members.map(
                m => this.#buildMemberRow(m),
            )}
        </ul>`;
    }

    #buildMemberRow(
        m: CrewRoleMember,
    ): SafeHtml {
        return html`<li class="${
            'flex items-center'
            + ' justify-between gap-2'
            + ' crew-role-row'
        }">
            <span>${m.role.nameText()}</span>
            <button class="${
                'btn btn-ghost btn-icon btn-xs'
            }"
                aria-label="${
                    'Remove ' + m.role.nameText()
                    + ' from crew'
                }"
                data-crew-role-action="remove"
                data-membership-id="${
                    m.membershipId
                }">
                ${iconTrash(14, '')}
            </button>
        </li>`;
    }

    #buildAddRoleSelect(): SafeHtml {
        if (this.#availableRoles.length === 0) {
            return html`<p class="${
                'text-xs text-muted'
            }">
                No more roles available to add.
            </p>`;
        }
        return html`<div class="${
            'flex items-center gap-2'
        }">
            <select class="${
                'input input-narrow flex-1'
                + ' crew-add-role-select'
            }"
                data-crew-id="${
                    this.#crew.idForLink()
                }"
                aria-label="${
                    'Add a role to crew'
                }">
                ${this.#availableRoles.map(
                    r => html`<option
                        value="${r.idForLink()}">
                        ${r.nameText()}
                    </option>`,
                )}
            </select>
            <button class="${
                'btn btn-secondary btn-sm gap-1'
            }"
                data-crew-role-action="add"
                data-crew-id="${
                    this.#crew.idForLink()
                }">
                ${iconPlus(14, '')}
                Add
            </button>
        </div>`;
    }
}

export type CrewListState = {
    crews: Crew[];
    rolesByCrew: Map<Id, CrewRoleMember[]>;
    persistedRoles: Role[];
    expandedCrewId: Id | null;
    search: string;
};

function resolveRoleForMembership(
    m: CrewRoleMembershipEntity,
    roleMap: Map<Id, Role>,
    personMap: Map<Id, Person>,
): Role | null {
    if (isUserPrivateRoleId(m.role_id)) {
        const personId =
            personIdFromUserPrivateRoleId(
                m.role_id,
            );
        const person = personMap.get(personId);
        if (!person) return null;
        return userPrivateRoleFor(person);
    }
    return roleMap.get(m.role_id) ?? null;
}

function buildRolesByCrew(
    memberships: CrewRoleMembershipEntity[],
    roleMap: Map<Id, Role>,
    personMap: Map<Id, Person>,
): Map<Id, CrewRoleMember[]> {
    const out = new Map<Id, CrewRoleMember[]>();
    for (const m of memberships) {
        const role = resolveRoleForMembership(
            m, roleMap, personMap,
        );
        if (!role) continue;
        const list = out.get(m.crew_id) ?? [];
        list.push({
            membershipId: m.id,
            role,
        });
        out.set(m.crew_id, list);
    }
    return out;
}

export function buildInitialCrewListState(
    crews: Crew[],
    memberships: CrewRoleMembershipEntity[],
    roleMap: Map<Id, Role>,
    personMap: Map<Id, Person>,
    persistedRoles: Role[],
): CrewListState {
    return {
        crews,
        rolesByCrew: buildRolesByCrew(
            memberships, roleMap, personMap,
        ),
        persistedRoles,
        expandedCrewId: null,
        search: '',
    };
}

export function applyCrewListSearch(
    s: CrewListState, q: string,
): CrewListState {
    return { ...s, search: q };
}

export function applyCrewListToggleExpand(
    s: CrewListState, crewId: Id,
): CrewListState {
    return {
        ...s,
        expandedCrewId:
            s.expandedCrewId === crewId
                ? null
                : crewId,
    };
}

export function applyCrewListUpdate(
    s: CrewListState,
    crews: Crew[],
    memberships: CrewRoleMembershipEntity[],
    roleMap: Map<Id, Role>,
    personMap: Map<Id, Person>,
    persistedRoles: Role[],
): CrewListState {
    return {
        ...s,
        crews,
        rolesByCrew: buildRolesByCrew(
            memberships, roleMap, personMap,
        ),
        persistedRoles,
    };
}

export function availableRolesForCrew(
    persisted: Role[],
    members: CrewRoleMember[],
): Role[] {
    const taken = new Set(
        members.map(m => m.role.idForLink()),
    );
    return persisted.filter(
        r => !taken.has(r.idForLink()),
    );
}

export class CrewListPresenter {
    readonly #presenters: CrewPresenter[];
    readonly #search: string;

    constructor(state: CrewListState) {
        this.#presenters = state.crews.map(
            crew => new CrewPresenter(
                crew,
                state.rolesByCrew.get(
                    crew.idForLink(),
                ) ?? [],
                availableRolesForCrew(
                    state.persistedRoles,
                    state.rolesByCrew.get(
                        crew.idForLink(),
                    ) ?? [],
                ),
                state.expandedCrewId
                    === crew.idForLink(),
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
            }">No crews match your
                search.</div>`;
        }
        return html`${
            filtered.map(p => p.buildRow())
        }`;
    }
}
