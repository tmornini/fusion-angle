import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanWorker,
    AIWorker,
    type WorkerState,
} from '../api/types.ts';
import {
    getProviderModels,
} from '../api/provider-models.ts';

// Build/seed workers in the post-normalization shape: a
// parent row (type + name) plus a kind-specific detail
// row, sharing one id. Fixtures use these so the two-
// table worker shape lives in exactly one place.

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

export function makeHumanWorker(
    id: string,
    name: string,
    state: WorkerState = 'active',
): HumanWorker {
    return new HumanWorker(
        { id, type: 'human', name },
        { id, ...humanDetail(id) },
        state,
    );
}

export function makeAIWorker(
    id: string,
    name: string,
    state: WorkerState = 'active',
): AIWorker {
    return new AIWorker(
        { id, type: 'ai', name },
        { id, ...aiDetail() },
        state,
    );
}

export async function seedHumanWorker(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: WorkerState = 'active',
): Promise<void> {
    await db.workers.put(id, { type: 'human', name });
    await db.humanWorkers.put(id, humanDetail(id));
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

export async function seedAIWorker(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: WorkerState = 'active',
): Promise<void> {
    await db.workers.put(id, { type: 'ai', name });
    await db.aiWorkers.put(id, aiDetail());
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

export async function seedCurrentWorker(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanWorker(db, 'current', 'Demo User');
}
