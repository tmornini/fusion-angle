import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Role, nowUtc } from '../api/types.ts';
import {
    RolePresenter,
    buildInitialRoleListState,
    applyRoleListSearch,
    applyRoleListUpdate,
} from '../web-app/app/presenters/role.ts';

function makeRole(
    id: string,
    name: string,
    description = '',
): Role {
    return new Role({
        id, name, description,
        created_at: nowUtc(),
    });
}

function makeMembership(
    id: string,
    roleId: string,
    personId: string,
) {
    return {
        id, role_id: roleId,
        person_id: personId,
        created_at: nowUtc(),
    };
}

test(
    'buildInitialRoleListState computes'
    + ' member counts correctly',
    () => {
        const roles = [
            makeRole('r-1', 'Engineering'),
            makeRole('r-2', 'Design'),
        ];
        const memberships = [
            makeMembership('m-1', 'r-1', 'p-1'),
            makeMembership('m-2', 'r-1', 'p-2'),
            makeMembership('m-3', 'r-2', 'p-3'),
        ];
        const state = buildInitialRoleListState(
            roles, memberships,
        );
        assert.equal(
            state.memberCounts.get('r-1'), 2,
        );
        assert.equal(
            state.memberCounts.get('r-2'), 1,
        );
        assert.equal(state.search, '');
    },
);

test(
    'applyRoleListSearch filters by name and'
    + ' description case-insensitively',
    () => {
        const roles = [
            makeRole(
                'r-1', 'Engineering',
                'Builds the product',
            ),
            makeRole(
                'r-2', 'Design',
                'Shapes the experience',
            ),
        ];
        const state = buildInitialRoleListState(
            roles, [],
        );
        const upper =
            applyRoleListSearch(state, 'ENGIN');
        assert.equal(upper.search, 'ENGIN');
        const presenter = new RolePresenter(
            roles[0]!, 0,
        );
        assert.ok(
            presenter.matchesSearch(
                upper.search,
            ),
        );
        const designSearch = applyRoleListSearch(
            state, 'shapes',
        );
        const designPresenter = new RolePresenter(
            roles[1]!, 0,
        );
        assert.ok(
            designPresenter.matchesSearch(
                designSearch.search,
            ),
        );
    },
);

test(
    'applyRoleListUpdate replaces both roles'
    + ' and counts',
    () => {
        const initial = buildInitialRoleListState(
            [makeRole('r-1', 'Engineering')],
            [makeMembership(
                'm-1', 'r-1', 'p-1',
            )],
        );
        assert.equal(
            initial.memberCounts.get('r-1'), 1,
        );
        const updated = applyRoleListUpdate(
            initial,
            [makeRole('r-2', 'Design')],
            [
                makeMembership(
                    'm-1', 'r-2', 'p-1',
                ),
                makeMembership(
                    'm-2', 'r-2', 'p-2',
                ),
            ],
        );
        assert.equal(updated.roles.length, 1);
        assert.equal(
            updated.roles[0]!.idForLink(), 'r-2',
        );
        assert.equal(
            updated.memberCounts.get('r-2'), 2,
        );
        assert.equal(
            updated.memberCounts.has('r-1'),
            false,
        );
    },
);

test(
    'RolePresenter.matchesSearch matches name'
    + ' fragments',
    () => {
        const presenter = new RolePresenter(
            makeRole(
                'r-1', 'Quality Assurance',
            ),
            0,
        );
        assert.ok(
            presenter.matchesSearch('quality'),
        );
        assert.ok(
            presenter.matchesSearch('SURANCE'),
        );
        assert.equal(
            presenter.matchesSearch(
                'engineering',
            ),
            false,
        );
    },
);

test(
    'RolePresenter.matchesSearch matches'
    + ' description fragments',
    () => {
        const presenter = new RolePresenter(
            makeRole(
                'r-1', 'Engineering',
                'Builds the rocket ship',
            ),
            0,
        );
        assert.ok(
            presenter.matchesSearch('rocket'),
        );
        assert.equal(
            presenter.matchesSearch('garden'),
            false,
        );
    },
);

test(
    'RolePresenter.matchesSearch returns true'
    + ' for empty/whitespace query',
    () => {
        const presenter = new RolePresenter(
            makeRole('r-1', 'Engineering'),
            0,
        );
        assert.ok(presenter.matchesSearch(''));
        assert.ok(
            presenter.matchesSearch('   '),
        );
    },
);
