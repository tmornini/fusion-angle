import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanMember,
    AIMember,
    type MemberState,
} from '../api/types.ts';
import {
    getProviderModels,
} from '../api/provider-models.ts';

// Build/seed members in the post-normalization shape: a
// parent row (type + name) plus a kind-specific detail
// row, sharing one id. Fixtures use these so the two-
// table member shape lives in exactly one place.

function humanDetail(id: string) {
    return {
        email: `${id}@example.com`.toLowerCase(),
        phone: '',
        title: 'product_manager',
        department: 'Product',
        strengths: '[]',
        team_dimensions: '{}',
        bio: '',
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
        { id, type: 'human', name },
        { id, ...humanDetail(id) },
        state,
    );
}

export function makeAIMember(
    id: string,
    name: string,
    state: MemberState = 'active',
): AIMember {
    return new AIMember(
        { id, type: 'ai', name },
        { id, ...aiDetail() },
        state,
    );
}

export async function seedHumanMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    await db.members.put(id, { type: 'human', name });
    await db.humanMembers.put(id, humanDetail(id));
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

export async function seedAIMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    await db.members.put(id, { type: 'ai', name });
    await db.aiMembers.put(id, aiDetail());
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

export async function seedCurrentMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanMember(db, 'current', 'Demo User');
}
