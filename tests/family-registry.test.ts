import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    FAMILY_REGISTRY,
    familyRegistration,
} from '../api/family-registry.ts';

test('ideas registers organization-nested, simple concurrency',
() => {
    assert.deepEqual(familyRegistration('ideas'), {
        family: 'ideas',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('projects is the second registered family', () => {
    assert.deepEqual(familyRegistration('projects'), {
        family: 'projects',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('flows is the third registered family, the first'
+ ' locked one', () => {
    assert.deepEqual(familyRegistration('flows'), {
        family: 'flows',
        organizationNested: true,
        concurrency: 'locked',
        createBodyIdField: 'id',
    });
});

test('work-orders is the fourth registered family,'
+ ' simple like ideas and projects', () => {
    assert.deepEqual(familyRegistration('work-orders'), {
        family: 'work-orders',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('records is the fifth registered family, simple'
+ ' like ideas, projects, and work-orders', () => {
    assert.deepEqual(familyRegistration('records'), {
        family: 'records',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('record-attributes is the sixth registered family,'
+ ' simple like records', () => {
    assert.deepEqual(familyRegistration('record-attributes'), {
        family: 'record-attributes',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('objectives is the seventh registered family, simple'
+ ' like records and record-attributes', () => {
    assert.deepEqual(familyRegistration('objectives'), {
        family: 'objectives',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('memberships is the eighth registered family,'
+ ' organization-nested like the rest', () => {
    assert.deepEqual(familyRegistration('memberships'), {
        family: 'memberships',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('members is the ninth registered family, the first'
+ ' global-plane (organizationNested false) row', () => {
    assert.deepEqual(familyRegistration('members'), {
        family: 'members',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('ai-members is the tenth registered family,'
+ ' global-plane like members', () => {
    assert.deepEqual(familyRegistration('ai-members'), {
        family: 'ai-members',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('human-members is the eleventh registered family,'
+ ' global-plane like ai-members', () => {
    assert.deepEqual(familyRegistration('human-members'), {
        family: 'human-members',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('an unregistered family returns undefined', () => {
    assert.equal(familyRegistration('identities'), undefined);
});

test('every registered family names a concurrency class',
() => {
    for (const entry of FAMILY_REGISTRY) {
        assert.ok(
            entry.concurrency === 'simple'
                || entry.concurrency === 'locked',
        );
    }
});
