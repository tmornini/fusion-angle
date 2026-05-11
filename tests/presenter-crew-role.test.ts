import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Role, Crew, nowUtc } from '../api/types.ts';
import {
    CrewPresenter,
    type CrewRoleMember,
} from '../web-app/app/presenters/crew.ts';
import { RolePresenter } from
    '../web-app/app/presenters/role.ts';

// The page-level tests (page-crews.test.ts /
// page-roles.test.ts) cover list state and
// matchesSearch but never instantiate the
// row markup. These tests pin buildRow() output
// branches: chevron direction, count
// pluralization, empty member list, and the
// "no roles left to add" select fallback.

function makeRole(
    id: string, name: string, description = '',
): Role {
    return new Role({
        id, name, description,
        created_at: nowUtc(),
    });
}

function makeCrew(
    id: string, name: string, description = '',
): Crew {
    return new Crew({
        id, name, description,
        created_at: nowUtc(),
    });
}

function member(
    membershipId: string, role: Role,
): CrewRoleMember {
    return { membershipId, role };
}

function noUnknownMagic(s: string): void {
    assert.equal(
        /\bUnknown\b/.test(s), false,
        'output must not contain "Unknown"',
    );
}

// RolePresenter.buildRow

test(
    'RolePresenter.buildRow renders the role name,'
    + ' description, and a delete-role hook',
    () => {
        const out = new RolePresenter(
            makeRole(
                'r-1', 'Engineering',
                'Builds the product',
            ),
            2,
        ).buildRow().toString();
        assert.match(out, /Engineering/);
        assert.match(out, /Builds the product/);
        assert.match(out, /data-role-id="r-1"/);
        assert.match(
            out, /data-role-action="delete"/,
        );
        noUnknownMagic(out);
    },
);

test(
    'RolePresenter.buildRow says "1 member" for a'
    + ' single member and pluralizes otherwise',
    () => {
        const one = new RolePresenter(
            makeRole('r-1', 'Eng'), 1,
        ).buildRow().toString();
        assert.match(one, /1 member\b/);
        assert.equal(/members/.test(one), false);
        const many = new RolePresenter(
            makeRole('r-1', 'Eng'), 4,
        ).buildRow().toString();
        assert.match(many, /4 members/);
        const zero = new RolePresenter(
            makeRole('r-1', 'Eng'), 0,
        ).buildRow().toString();
        assert.match(zero, /0 members/);
    },
);

test(
    'RolePresenter.buildRow escapes a role name'
    + ' that contains HTML metacharacters',
    () => {
        const out = new RolePresenter(
            makeRole('r-1', '<i>x</i>'), 0,
        ).buildRow().toString();
        assert.match(out, /&lt;i&gt;x&lt;\/i&gt;/);
        assert.equal(/<i>x<\/i>/.test(out), false);
    },
);

// CrewPresenter.buildRow

test(
    'CrewPresenter.buildRow shows the crew name,'
    + ' description, toggle hook, and delete hook',
    () => {
        const out = new CrewPresenter(
            makeCrew(
                'c-1', 'Delivery',
                'Ships the work',
            ),
            [], [], false,
        ).buildRow().toString();
        assert.match(out, /Delivery/);
        assert.match(out, /Ships the work/);
        assert.match(out, /data-crew-id="c-1"/);
        assert.match(
            out, /data-crew-action="toggle"/,
        );
        assert.match(
            out, /data-crew-action="delete"/,
        );
        noUnknownMagic(out);
    },
);

test(
    'CrewPresenter.buildRow pluralizes the role'
    + ' count and uses the singular for one role',
    () => {
        const one = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [member('m-1', makeRole('r-1', 'Eng'))],
            [], false,
        ).buildRow().toString();
        assert.match(one, /1 role\b/);
        assert.equal(/1 roles/.test(one), false);
        const many = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [
                member('m-1', makeRole('r-1', 'Eng')),
                member('m-2', makeRole('r-2', 'QA')),
            ],
            [], false,
        ).buildRow().toString();
        assert.match(many, /2 roles/);
    },
);

test(
    'CrewPresenter.buildRow hides the expansion'
    + ' body when the crew is collapsed',
    () => {
        const out = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [member('m-1', makeRole('r-1', 'Eng'))],
            [makeRole('r-2', 'QA')],
            false,
        ).buildRow().toString();
        assert.equal(
            /crew-expansion/.test(out), false,
        );
        assert.equal(
            /crew-add-role-select/.test(out), false,
        );
    },
);

test(
    'CrewPresenter.buildRow when expanded lists'
    + ' member roles with remove buttons',
    () => {
        const out = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [
                member(
                    'm-1', makeRole('r-1', 'Eng'),
                ),
                member('m-2', makeRole('r-2', 'QA')),
            ],
            [makeRole('r-3', 'Design')],
            true,
        ).buildRow().toString();
        assert.match(out, /crew-expansion/);
        assert.match(out, /Eng/);
        assert.match(out, /QA/);
        assert.match(
            out, /data-crew-role-action="remove"/,
        );
        assert.match(
            out, /data-membership-id="m-1"/,
        );
        assert.match(
            out, /data-membership-id="m-2"/,
        );
    },
);

test(
    'CrewPresenter.buildRow when expanded with no'
    + ' members shows the empty-state copy',
    () => {
        const out = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [], [makeRole('r-1', 'Eng')], true,
        ).buildRow().toString();
        assert.match(
            out, /No roles in this crew yet/,
        );
        assert.equal(
            /data-crew-role-action="remove"/
                .test(out),
            false,
        );
    },
);

test(
    'CrewPresenter.buildRow when expanded offers'
    + ' an add-role select listing free roles',
    () => {
        const out = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [], [makeRole('r-1', 'Engineering')],
            true,
        ).buildRow().toString();
        assert.match(out, /crew-add-role-select/);
        assert.match(out, /data-crew-role-action="add"/);
        assert.match(out, /value="r-1"/);
        assert.match(out, /Engineering/);
    },
);

test(
    'CrewPresenter.buildRow when expanded with no'
    + ' free roles shows the no-roles-left copy',
    () => {
        const out = new CrewPresenter(
            makeCrew('c-1', 'Crew'),
            [member('m-1', makeRole('r-1', 'Eng'))],
            [], true,
        ).buildRow().toString();
        assert.match(
            out, /No more roles available to add/,
        );
        assert.equal(
            /crew-add-role-select/.test(out), false,
        );
    },
);
