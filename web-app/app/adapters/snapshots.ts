import { MissingTableError } from '../../../api/db.ts';
import type { PersonEntity } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

// Fallback when navigator.storage.estimate() is
// unavailable (older browsers, Node test runtime).
// Conservative default that fits comfortably in any
// browser's localStorage quota.
const FALLBACK_SNAPSHOT_CAP_BYTES = 5_000_000;

// Headroom for the import operation itself: the
// importSnapshot path holds the parsed snapshot in
// memory while writing per-table payloads, briefly
// doubling peak usage. Half the available quota keeps
// us off the QuotaExceededError edge.
const QUOTA_HEADROOM_RATIO = 0.5;

export class SnapshotTooLargeError extends Error {
    readonly fileSize: number;
    readonly available: number;
    constructor(
        fileSize: number,
        available: number,
    ) {
        super(
            'Snapshot too large: ' + fileSize
            + ' bytes exceeds available cap '
            + available + ' bytes',
        );
        this.name = 'SnapshotTooLargeError';
        this.fileSize = fileSize;
        this.available = available;
    }
}

async function computeAvailableForUpload(
): Promise<number> {
    const storage =
        typeof navigator !== 'undefined'
            ? navigator.storage
            : undefined;
    if (storage?.estimate) {
        const est = await storage.estimate();
        if (
            est.quota === undefined
            || est.usage === undefined
        ) {
            return FALLBACK_SNAPSHOT_CAP_BYTES;
        }
        return Math.max(
            0, est.quota - est.usage,
        );
    }
    return FALLBACK_SNAPSHOT_CAP_BYTES;
}

export async function deleteSchema(
    ctx: RequestContext,
): Promise<void> {
    await ctx.DELETE('snapshots/schema');
}

export async function postSchemaCreation(
    ctx: RequestContext,
): Promise<void> {
    await ctx.POST('snapshots/schema', {});
}

export async function postMockDataLoad(
    ctx: RequestContext,
): Promise<void> {
    await ctx.POST(
        'snapshots/mock-data', {},
    );
}

export async function postBootstrap(
    ctx: RequestContext,
): Promise<void> {
    await ctx.POST(
        'snapshots/bootstrap', {},
    );
}

export async function putSnapshot(
    ctx: RequestContext,
    json: string,
): Promise<void> {
    await ctx.PUT('snapshots/import', { json });
}

export async function putSnapshotFromFile(
    ctx: RequestContext,
    file: File,
): Promise<void> {
    const available =
        await computeAvailableForUpload();
    const cap = Math.floor(
        available * QUOTA_HEADROOM_RATIO,
    );
    if (file.size > cap) {
        throw new SnapshotTooLargeError(
            file.size, cap,
        );
    }
    const json = await file.text();
    await putSnapshot(ctx, json);
}

export async function getSnapshot(
    ctx: RequestContext,
): Promise<string> {
    return ctx.GET<string>('snapshots/schema');
}

// Uses ctx.GET directly on purpose: a missing table
// is the expected non-error path here, and a
// higher-level accessor could obscure the error
// type for any later caller sharing this ctx.
export async function getDataPresent(
    ctx: RequestContext,
): Promise<boolean> {
    try {
        const people =
            await ctx.GET<PersonEntity[]>('people');
        return people.length > 0;
    } catch (err) {
        if (err instanceof MissingTableError) {
            return false;
        }
        throw err;
    }
}
