import { GET, POST, PUT, DELETE } from '../../../api/api';
import type { UserEntity } from '../../../api/types';

export async function deleteSchema(): Promise<void> {
    await DELETE('snapshots/schema');
}

export async function postSchemaCreation(
): Promise<void> {
    await POST('snapshots/schema', {});
}

export async function postMockDataLoad(
): Promise<void> {
    await POST(
        'snapshots/mock-data', {},
    );
}

export async function postBootstrap(
): Promise<void> {
    await POST(
        'snapshots/bootstrap', {},
    );
}

export async function putSnapshot(json: string): Promise<void> {
    await PUT('snapshots/import', { json });
}

export async function getSnapshot(): Promise<string> {
    return GET<string>('snapshots/schema');
}

export async function hasData(): Promise<boolean> {
    const users = await GET<UserEntity[]>('users');
    return users.length > 0;
}
