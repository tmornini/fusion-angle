import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    isWorkOrderVisibleToPerson,
    type VisibilityScope,
} from '../web-app/app/presenters/workbox-inbox.ts';

const EMPTY_SCOPE: VisibilityScope = {
    currentPersonId: 'p-current',
    roleMemberSetByRoleId: new Map(),
    crewMemberSetByCrewId: new Map(),
};

test(
    'isWorkOrderVisibleToPerson: unassigned is'
    + ' visible to all',
    () => {
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'unassigned' },
                EMPTY_SCOPE,
            ),
            true,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: model is hidden'
    + ' from all people',
    () => {
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'model', modelId: 'm-1' },
                EMPTY_SCOPE,
            ),
            false,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: role-assigned'
    + ' is visible when person is in the role',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map([
                ['r-eng', new Set(['p-current'])],
            ]),
            crewMemberSetByCrewId: new Map(),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'role', roleId: 'r-eng' },
                scope,
            ),
            true,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: role-assigned'
    + ' is hidden when person is not in the role',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map([
                ['r-eng', new Set(['p-other'])],
            ]),
            crewMemberSetByCrewId: new Map(),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'role', roleId: 'r-eng' },
                scope,
            ),
            false,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: user-private'
    + ' role short-circuits to the encoded'
    + ' person id',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map(),
            crewMemberSetByCrewId: new Map(),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                {
                    kind: 'role',
                    roleId:
                        'user-private:p-current',
                },
                scope,
            ),
            true,
        );
        assert.equal(
            isWorkOrderVisibleToPerson(
                {
                    kind: 'role',
                    roleId:
                        'user-private:p-other',
                },
                scope,
            ),
            false,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: crew-assigned'
    + ' is visible when person is in the crew',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map(),
            crewMemberSetByCrewId: new Map([
                ['c-1', new Set(['p-current'])],
            ]),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'crew', crewId: 'c-1' },
                scope,
            ),
            true,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: crew-assigned'
    + ' is hidden when person is not in the crew',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map(),
            crewMemberSetByCrewId: new Map([
                ['c-1', new Set(['p-other'])],
            ]),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'crew', crewId: 'c-1' },
                scope,
            ),
            false,
        );
    },
);

test(
    'isWorkOrderVisibleToPerson: crew-assigned'
    + ' is hidden when crew has no entry in map',
    () => {
        const scope: VisibilityScope = {
            currentPersonId: 'p-current',
            roleMemberSetByRoleId: new Map(),
            crewMemberSetByCrewId: new Map(),
        };
        assert.equal(
            isWorkOrderVisibleToPerson(
                { kind: 'crew', crewId: 'c-1' },
                scope,
            ),
            false,
        );
    },
);
