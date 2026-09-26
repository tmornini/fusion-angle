import { assertEquals, assertStrictEquals } from '@std/assert';
import { familyRegistration } from '../api/family-registry.ts';

Deno.test('ideas registers organization-nested', () => {
    assertEquals(familyRegistration('ideas'), {
        family: 'ideas',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('projects is the second registered family', () => {
    assertEquals(familyRegistration('projects'), {
        family: 'projects',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('flows is the third registered family', () => {
    assertEquals(familyRegistration('flows'), {
        family: 'flows',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('work-orders is the fourth registered family',
() => {
    assertEquals(familyRegistration('work-orders'), {
        family: 'work-orders',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('record-types is the fifth registered family',
() => {
    assertEquals(familyRegistration('record-types'), {
        family: 'record-types',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('record-attributes is the sixth registered family',
() => {
    assertEquals(familyRegistration('record-attributes'), {
        family: 'record-attributes',
        organizationNested: true,
        createBodyIdField: 'id',
    });
});

Deno.test('objectives is the seventh registered family',
() => {
    assertEquals(familyRegistration('objectives'), {
        family: 'objectives',
        organizationNested: true,
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
        createBodyIdField: 'id',
    });
});

Deno.test('organizations is the tenant root — global-plane'
+ ' like identities',
() => {
    assertEquals(familyRegistration('organizations'), {
        family: 'organizations',
        organizationNested: false,
        createBodyIdField: 'id',
    });
});

Deno.test('ai-agents is a live global-plane family,'
+ ' not a member and not an identity',
() => {
    assertEquals(familyRegistration('ai-agents'), {
        family: 'ai-agents',
        organizationNested: false,
        createBodyIdField: 'id',
    });
});

Deno.test('an unregistered family returns undefined', () => {
    assertStrictEquals(familyRegistration('not-a-family'), undefined);
});
