import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanMember,
    AIMember,
    DEFAULT_ORG,
    type MemberState,
} from '../api/types.ts';
import {
    getProviderModels,
} from '../api/provider-models.ts';

// Build/seed members in the post-normalization shape: a
// parent row (type only) plus a kind-specific detail row,
// sharing one id. The display name lives with the kind —
// ai_members.name, identity_pii.name. Fixtures use these
// so the two-table member shape lives in exactly one place.

function humanDetail() {
    return {
        title: 'product_manager',
        department: 'Product',
        strengths: '[]',
        team_dimensions: '{}',
    };
}

function aiDetail() {
    return {
        description: '',
        skill_focus: '',
        model: getProviderModels()[0]!.id,
    };
}

export function makeHumanMember(
    id: string,
    name: string,
    state: MemberState = 'active',
): HumanMember {
    return new HumanMember(
        { id, type: 'human' },
        { id, ...humanDetail() },
        {
            erased: false,
            name,
            email: `${id}@example.com`.toLowerCase(),
            phone: '',
            bio: '',
        },
        state,
    );
}

export function makeAIMember(
    id: string,
    name: string,
    state: MemberState = 'active',
): AIMember {
    return new AIMember(
        { id, type: 'ai' },
        { id, name, ...aiDetail() },
        state,
    );
}

export async function seedHumanMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    await db.members.put(id, { type: 'human' });
    await db.humanMembers.put(id, humanDetail());
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, {
        name,
        email: `${id}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    });
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
    // A member belongs to an org via the ledger — the member
    // list derives from it, so a seeded member needs one.
    await db.memberships.put(`mb-${id}`, {
        organization_id: DEFAULT_ORG,
        identity_id: id,
        at: '2020-01-01T00:00:00.000Z',
    });
}

export async function seedAIMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    await db.members.put(id, { type: 'ai' });
    await db.aiMembers.put(id, { name, ...aiDetail() });
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
    await db.memberships.put(`mb-${id}`, {
        organization_id: DEFAULT_ORG,
        identity_id: id,
        at: '2020-01-01T00:00:00.000Z',
    });
}

export async function seedCurrentMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanMember(db, 'current', 'Demo User');
}
