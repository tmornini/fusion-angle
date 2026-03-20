import { GET, POST, PUT, DELETE } from '../../../api/api';
import type { UserEntity } from '../../../api/types';

export async function deleteSchema(): Promise<void> {
    await DELETE('snapshots/schema');
}

export async function createSchema(): Promise<void> {
    await POST('snapshots/schema', {});
}

export async function loadMockData(): Promise<void> {
    await POST('snapshots/mock-data', {});
}

export async function importSnapshot(json: string): Promise<void> {
    await PUT('snapshots/import', { json });
}

export async function exportSnapshot(): Promise<string> {
    return GET<string>('snapshots/schema');
}

export async function hasData(): Promise<boolean> {
    const users = await GET<UserEntity[]>('users');
    return users.length > 0;
}
