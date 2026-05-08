import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    Role, Crew, Person, nowUtc,
    jsonArrayField, jsonObjectField,
} from '../api/types.ts';
import {
    CrewPresenter,
    buildInitialCrewListState,
    applyCrewListSearch,
    applyCrewListToggleExpand,
    applyCrewListUpdate,
    availableRolesForCrew,
} from '../web-app/app/presenters/crew.ts';
import type { Id } from '../api/types.ts';

function makeCrew(
    id: string,
    name: string,
    description = '',
): Crew {
    return new Crew({
        id, name, description,
        created_at: nowUtc(),
    });
}

function makeRole(
    id: string, name: string,
): Role {
    return new Role({
        id, name, description: '',
        created_at: nowUtc(),
    });
}

function makePerson(
    id: string, first: string,
): Person {
    return new Person({
        id,
        first_name: first,
        last_name: 'Test',
        email:
            `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Eng',
        status: 'active',
        strengths: jsonArrayField([]),
        team_dimensions:
            jsonObjectField({ driver: 50 }),
        phone: '',
        bio: '',
    });
}

function makeMembership(
    id: string,
    crewId: string,
    roleId: string,
) {
    return {
        id, crew_id: crewId,
        role_id: roleId,
        created_at: nowUtc(),
    };
}

function buildMaps(
    roles: Role[],
    people: Person[],
): {
    roleMap: Map<Id, Role>;
    personMap: Map<Id, Person>;
} {
    return {
        roleMap: new Map(
            roles.map(r => [r.idForLink(), r]),
        ),
        personMap: new Map(
            people.map(p => [p.idForLink(), p]),
        ),
    };
}

test(
    'buildInitialCrewListState builds'
    + ' rolesByCrew map',
    () => {
        const crews = [
            makeCrew('c-1', 'Delivery'),
            makeCrew('c-2', 'Design'),
        ];
        const roles = [
            makeRole('r-eng', 'Engineering'),
            makeRole('r-qa', 'QA'),
            makeRole('r-ux', 'UX'),
        ];
        const memberships = [
            makeMembership(
                'm-1', 'c-1', 'r-eng',
            ),
            makeMembership(
                'm-2', 'c-1', 'r-qa',
            ),
            makeMembership(
                'm-3', 'c-2', 'r-ux',
            ),
        ];
        const { roleMap, personMap } = buildMaps(
            roles, [],
        );
        const state = buildInitialCrewListState(
            crews, memberships,
            roleMap, personMap, roles,
        );
        const c1Roles = state.rolesByCrew
            .get('c-1');
        assert.ok(c1Roles);
        assert.equal(c1Roles!.length, 2);
        assert.deepEqual(
            c1Roles!
                .map(m => m.role.idForLink())
                .toSorted(),
            ['r-eng', 'r-qa'],
        );
        const c2Roles = state.rolesByCrew
            .get('c-2');
        assert.equal(c2Roles?.length, 1);
        assert.equal(
            c2Roles?.[0]!.membershipId, 'm-3',
        );
    },
);

test(
    'buildInitialCrewListState resolves'
    + ' user-private roles via personMap',
    () => {
        const alice = makePerson('p-1', 'Alice');
        const crews = [makeCrew('c-1', 'Crew A')];
        const memberships = [makeMembership(
            'm-1', 'c-1', 'user-private:p-1',
        )];
        const { roleMap, personMap } = buildMaps(
            [], [alice],
        );
        const state = buildInitialCrewListState(
            crews, memberships,
            roleMap, personMap, [],
        );
        const list = state.rolesByCrew.get('c-1');
        assert.equal(list?.length, 1);
        assert.equal(
            list?.[0]!.role.nameText(),
            'Alice Test',
        );
    },
);

test(
    'applyCrewListToggleExpand toggles single'
    + ' crew, replaces previous expansion',
    () => {
        const initial = buildInitialCrewListState(
            [
                makeCrew('c-1', 'Crew A'),
                makeCrew('c-2', 'Crew B'),
            ],
            [], new Map(), new Map(), [],
        );
        const opened = applyCrewListToggleExpand(
            initial, 'c-1',
        );
        assert.equal(
            opened.expandedCrewId, 'c-1',
        );
        const switched =
            applyCrewListToggleExpand(
                opened, 'c-2',
            );
        assert.equal(
            switched.expandedCrewId, 'c-2',
        );
        const closed = applyCrewListToggleExpand(
            switched, 'c-2',
        );
        assert.equal(
            closed.expandedCrewId, null,
        );
    },
);

test(
    'applyCrewListSearch filters by name and'
    + ' description',
    () => {
        const initial = buildInitialCrewListState(
            [
                makeCrew(
                    'c-1', 'Engineering',
                    'Builds the rocket',
                ),
                makeCrew(
                    'c-2', 'Design',
                    'Shapes the experience',
                ),
            ],
            [], new Map(), new Map(), [],
        );
        const next = applyCrewListSearch(
            initial, 'rocket',
        );
        assert.equal(next.search, 'rocket');
        const presenters = initial.crews.map(
            crew => new CrewPresenter(
                crew, [], [], false,
            ),
        );
        const matches = presenters.filter(
            p => p.matchesSearch('rocket'),
        );
        assert.equal(matches.length, 1);
        assert.equal(
            matches[0]!.idForLink(), 'c-1',
        );
    },
);

test(
    'CrewPresenter.matchesSearch is'
    + ' case-insensitive',
    () => {
        const presenter = new CrewPresenter(
            makeCrew('c-1', 'Delivery Crew'),
            [], [], false,
        );
        assert.ok(
            presenter.matchesSearch('DELIVERY'),
        );
        assert.ok(
            presenter.matchesSearch('crew'),
        );
        assert.equal(
            presenter.matchesSearch('design'),
            false,
        );
    },
);

test(
    'availableRolesForCrew excludes roles'
    + ' already in the crew',
    () => {
        const persisted = [
            makeRole('r-1', 'Engineering'),
            makeRole('r-2', 'QA'),
            makeRole('r-3', 'Design'),
        ];
        const members = [
            {
                membershipId: 'm-1',
                role: makeRole('r-1', 'Eng'),
            },
        ];
        const available = availableRolesForCrew(
            persisted, members,
        );
        assert.equal(available.length, 2);
        assert.deepEqual(
            available.map(r => r.idForLink())
                .toSorted(),
            ['r-2', 'r-3'],
        );
    },
);

test(
    'applyCrewListUpdate replaces crews,'
    + ' rolesByCrew, and persistedRoles',
    () => {
        const initial = buildInitialCrewListState(
            [makeCrew('c-1', 'A')],
            [], new Map(), new Map(),
            [makeRole('r-old', 'Old')],
        );
        const newRoles = [
            makeRole('r-eng', 'Eng'),
        ];
        const { roleMap, personMap } = buildMaps(
            newRoles, [],
        );
        const updated = applyCrewListUpdate(
            initial,
            [makeCrew('c-2', 'B')],
            [makeMembership(
                'm-1', 'c-2', 'r-eng',
            )],
            roleMap, personMap, newRoles,
        );
        assert.equal(updated.crews.length, 1);
        assert.equal(
            updated.crews[0]!.idForLink(), 'c-2',
        );
        assert.equal(
            updated.persistedRoles.length, 1,
        );
        assert.equal(
            updated.rolesByCrew.get('c-2')!
                .length,
            1,
        );
        assert.equal(
            updated.rolesByCrew.has('c-1'),
            false,
        );
    },
);
