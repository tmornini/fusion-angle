import type {
    Id,
    RoleEntity,
    RoleMembershipEntity,
} from '../../../api/types.ts';
import {
    Role,
    Person,
    nowUtc,
    userPrivateRoleId,
    isUserPrivateRoleId,
    personIdFromUserPrivateRoleId,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    getPersonMap,
} from './people.ts';

export {
    Role,
} from '../../../api/types.ts';
export type {
    RoleEntity,
    RoleMembershipEntity,
} from '../../../api/types.ts';

const roleChanges =
    createSubscriptionChannel([
        'roles', 'role_memberships',
    ]);

const membershipChanges =
    createSubscriptionChannel([
        'role_memberships',
    ]);

export function subscribeRoleChanges(
    fn: () => void,
): () => void {
    return roleChanges.subscribe(fn);
}

export function subscribeMembershipChanges(
    fn: () => void,
): () => void {
    return membershipChanges.subscribe(fn);
}

export interface Member {
    readonly membershipId: Id;
    readonly role: Role;
    readonly person: Person;
    readonly createdAt: string;
}

export function isUserPrivateRole(
    role: Role,
): boolean {
    return isUserPrivateRoleId(
        role.idForLink(),
    );
}

export function userPrivateRoleFor(
    person: Person,
): Role {
    return new Role({
        id: userPrivateRoleId(
            person.idForLink(),
        ),
        name: person.fullName(),
        description: '',
        created_at: '',
    });
}

export async function getRoleMap(
    ctx: RequestContext,
): Promise<Map<Id, Role>> {
    const rows =
        await ctx.GET<RoleEntity[]>('roles');
    return new Map(
        rows.map(
            entity => [
                entity.id,
                new Role(entity),
            ],
        ),
    );
}

export async function getRoleMembershipRows(
    ctx: RequestContext,
): Promise<RoleMembershipEntity[]> {
    return ctx.GET<RoleMembershipEntity[]>(
        'role-memberships',
    );
}

export async function getRoles(
    ctx: RequestContext,
): Promise<Role[]> {
    const [roleMap, personMap] = await Promise.all([
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    const persisted = Array.from(
        roleMap.values(),
    );
    const userPrivate = Array.from(
        personMap.values(),
    )
        .filter(p => !p.isDeactivated())
        .map(userPrivateRoleFor);
    return [...persisted, ...userPrivate];
}

// User-private roles are derived per-person and
// belong to membership UIs; the index of named roles
// the organization manages excludes them by intent.
export async function getPersistedRoles(
    ctx: RequestContext,
): Promise<Role[]> {
    const map = await getRoleMap(ctx);
    return Array.from(map.values());
}

export async function getRole(
    ctx: RequestContext,
    id: Id,
): Promise<Role> {
    const map = await getRoleMap(ctx);
    const role = map.get(id);
    if (!role) {
        throw new Error(
            'getRole: unknown role ' + id,
        );
    }
    return role;
}

export async function putRole(
    ctx: RequestContext,
    id: Id,
    entity: Omit<RoleEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`roles/${id}`, entity);
    roleChanges.notify();
}

// Cascade-deletes every membership row that
// references this role, then deletes the role
// itself, in a single ctx.commit. Per the
// Article on Atomicity, the transactional
// primitive the platform provides — never
// simulated at the application layer.
export async function deleteRole(
    ctx: RequestContext,
    roleId: Id,
): Promise<void> {
    const memberships =
        await getRoleMembershipRows(ctx);
    const cascadeIds = memberships
        .filter(m => m.role_id === roleId)
        .map(m => m.id);
    await ctx.commit({
        ops: [
            ...cascadeIds.map(id => ({
                method: 'delete' as const,
                resource:
                    `role-memberships/${id}`,
            })),
            {
                method: 'delete' as const,
                resource: `roles/${roleId}`,
            },
        ],
    });
    roleChanges.notify();
    membershipChanges.notify();
}

export async function getMembersOfRole(
    ctx: RequestContext,
    roleId: Id,
): Promise<Member[]> {
    const [
        memberships, roleMap, personMap,
    ] = await Promise.all([
        getRoleMembershipRows(ctx),
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    const role = roleMap.get(roleId);
    if (!role) {
        throw new Error(
            'getMembersOfRole: unknown role '
            + roleId,
        );
    }
    return memberships
        .filter(m => m.role_id === roleId)
        .map(m => buildMember(
            m, role, personMap,
        ));
}

export async function getRolesForPerson(
    ctx: RequestContext,
    personId: Id,
): Promise<Role[]> {
    const [
        memberships, roleMap, personMap,
    ] = await Promise.all([
        getRoleMembershipRows(ctx),
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    const persisted = memberships
        .filter(m => m.person_id === personId)
        .map(m => {
            const role = roleMap.get(m.role_id);
            if (!role) {
                throw new Error(
                    'getRolesForPerson: '
                    + 'membership ' + m.id
                    + ' references unknown'
                    + ' role ' + m.role_id,
                );
            }
            return role;
        });
    const person = personMap.get(personId);
    if (!person) return persisted;
    return [
        ...persisted,
        userPrivateRoleFor(person),
    ];
}

export async function getMembersForPerson(
    ctx: RequestContext,
    personId: Id,
): Promise<Member[]> {
    const [
        memberships, roleMap, personMap,
    ] = await Promise.all([
        getRoleMembershipRows(ctx),
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    return memberships
        .filter(m => m.person_id === personId)
        .map(m => {
            const role = roleMap.get(m.role_id);
            if (!role) {
                throw new Error(
                    'getMembersForPerson: '
                    + 'membership ' + m.id
                    + ' references unknown'
                    + ' role ' + m.role_id,
                );
            }
            return buildMember(
                m, role, personMap,
            );
        });
}

export async function addMember(
    ctx: RequestContext,
    roleId: Id,
    personId: Id,
): Promise<void> {
    if (isUserPrivateRoleId(roleId)) {
        throw new Error(
            'addMember: user-private roles are'
            + ' not editable; create a named'
            + ' role instead',
        );
    }
    const [roleMap, personMap] = await Promise.all([
        getRoleMap(ctx),
        getPersonMap(ctx),
    ]);
    if (!roleMap.has(roleId)) {
        throw new Error(
            'addMember: unknown role ' + roleId,
        );
    }
    if (!personMap.has(personId)) {
        throw new Error(
            'addMember: unknown person '
            + personId,
        );
    }
    const id = generateCryptoSafeBase62();
    await ctx.PUT(
        `role-memberships/${id}`,
        {
            role_id: roleId,
            person_id: personId,
            created_at: nowUtc(),
        },
    );
    membershipChanges.notify();
}

export async function removeMember(
    ctx: RequestContext,
    membershipId: Id,
): Promise<void> {
    await ctx.DELETE(
        `role-memberships/${membershipId}`,
    );
    membershipChanges.notify();
}

function buildMember(
    m: RoleMembershipEntity,
    role: Role,
    personMap: Map<Id, Person>,
): Member {
    const person = personMap.get(m.person_id);
    if (!person) {
        throw new Error(
            'buildMember: membership ' + m.id
            + ' references unknown person '
            + m.person_id,
        );
    }
    return {
        membershipId: m.id,
        role,
        person,
        createdAt: m.created_at,
    };
}
