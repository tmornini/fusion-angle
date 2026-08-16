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

test('record-types is the fifth registered family, simple'
+ ' like ideas, projects, and work-orders', () => {
    assert.deepEqual(familyRegistration('record-types'), {
        family: 'record-types',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('record-attributes is the sixth registered family,'
+ ' simple like record-types', () => {
    assert.deepEqual(familyRegistration('record-attributes'), {
        family: 'record-attributes',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('objectives is the seventh registered family, simple'
+ ' like record-types and record-attributes', () => {
    assert.deepEqual(familyRegistration('objectives'), {
        family: 'objectives',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('leftover roster families are not registered', () => {
    assert.equal(
        familyRegistration('memberships'), undefined,
    );
    assert.equal(
        familyRegistration('members'), undefined,
    );
    assert.equal(
        familyRegistration('ai-members'), undefined,
    );
    assert.equal(
        familyRegistration('human-members'), undefined,
    );
});

test('identities is a live global-plane family', () => {
    assert.deepEqual(familyRegistration('identities'), {
        family: 'identities',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('organizations is the tenant root — global-plane'
+ ' like identities',
() => {
    assert.deepEqual(familyRegistration('organizations'), {
        family: 'organizations',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('ai-agents is a live global-plane family,'
+ ' not a member and not an identity',
() => {
    assert.deepEqual(familyRegistration('ai-agents'), {
        family: 'ai-agents',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

test('an unregistered family returns undefined', () => {
    assert.equal(familyRegistration('not-a-family'), undefined);
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
