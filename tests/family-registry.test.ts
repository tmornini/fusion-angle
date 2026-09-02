import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    FAMILY_REGISTRY,
    familyRegistration,
} from '../api/family-registry.ts';

Deno.test('ideas registers organization-nested, simple concurrency',
() => {
    assertEquals(familyRegistration('ideas'), {
        family: 'ideas',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('projects is the second registered family', () => {
    assertEquals(familyRegistration('projects'), {
        family: 'projects',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('flows is the third registered family, the first'
+ ' locked one', () => {
    assertEquals(familyRegistration('flows'), {
        family: 'flows',
        organizationNested: true,
        concurrency: 'locked',
        createBodyIdField: 'id',
    });
});

Deno.test('work-orders is the fourth registered family,'
+ ' simple like ideas and projects', () => {
    assertEquals(familyRegistration('work-orders'), {
        family: 'work-orders',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('record-types is the fifth registered family, simple'
+ ' like ideas, projects, and work-orders', () => {
    assertEquals(familyRegistration('record-types'), {
        family: 'record-types',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('record-attributes is the sixth registered family,'
+ ' simple like record-types', () => {
    assertEquals(familyRegistration('record-attributes'), {
        family: 'record-attributes',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('objectives is the seventh registered family, simple'
+ ' like record-types and record-attributes', () => {
    assertEquals(familyRegistration('objectives'), {
        family: 'objectives',
        organizationNested: true,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('leftover roster families are not registered', () => {
    assertStrictEquals(
        familyRegistration('memberships'), undefined,
    );
    assertStrictEquals(
        familyRegistration('members'), undefined,
    );
    assertStrictEquals(
        familyRegistration('ai-members'), undefined,
    );
    assertStrictEquals(
        familyRegistration('human-members'), undefined,
    );
});

Deno.test('identities is a live global-plane family', () => {
    assertEquals(familyRegistration('identities'), {
        family: 'identities',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('organizations is the tenant root — global-plane'
+ ' like identities',
() => {
    assertEquals(familyRegistration('organizations'), {
        family: 'organizations',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('ai-agents is a live global-plane family,'
+ ' not a member and not an identity',
() => {
    assertEquals(familyRegistration('ai-agents'), {
        family: 'ai-agents',
        organizationNested: false,
        concurrency: 'simple',
        createBodyIdField: 'id',
    });
});

Deno.test('an unregistered family returns undefined', () => {
    assertStrictEquals(familyRegistration('not-a-family'), undefined);
});

Deno.test('every registered family names a concurrency class',
() => {
    for (const entry of FAMILY_REGISTRY) {
        assert(
            entry.concurrency === 'simple'
                || entry.concurrency === 'locked',
        );
    }
});
