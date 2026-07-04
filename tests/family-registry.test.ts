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

test('an unregistered family returns undefined', () => {
    assert.equal(familyRegistration('records'), undefined);
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
