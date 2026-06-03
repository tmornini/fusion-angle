import type { MemoryDbAdapter } from '../api/db-memory.ts';

export async function seedPersonIdentity(
    db: MemoryDbAdapter,
    id: string,
    pii: {
        name: string; email: string;
        phone: string; bio: string;
    },
): Promise<void> {
    await db.identities.put(id, { kind: 'person' });
    await db.identityPii.put(id, pii);
}

export async function seedServiceIdentity(
    db: MemoryDbAdapter,
    id: string,
): Promise<void> {
    await db.identities.put(id, { kind: 'service' });
}
