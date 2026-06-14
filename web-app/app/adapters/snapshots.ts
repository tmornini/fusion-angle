import type { RequestContext } from './shared.ts';
import type { SeededCredentials } from '../../../api/mock-data.ts';
import { MissingTableError } from '../../../api/db.ts';
import {
    RequestError,
    UnauthorizedError,
} from '../../../api/api.ts';

// Fallback when navigator.storage.estimate() is
// unavailable (older browsers, Node test runtime).
// Conservative default that fits comfortably in any
// browser's localStorage quota.
const FALLBACK_SNAPSHOT_CAP_BYTES = 5_000_000;

// Headroom for the import operation itself: the
// putSnapshot path holds the parsed snapshot in
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

// Tables and per-table fields the schema has retired.
// Old snapshots carrying them are not migrated — the
// importer rejects them with this error and routes the
// user back to re-snapshot from current state.
export const RETIRED_KEYS_PER_TABLE:
    Record<string, readonly string[]> = {
    members: ['first_name', 'last_name'],
    ai_members: ['created_at', 'auth_token', 'provider'],
    flows: ['created_at', 'updated_at'],
    work_orders: ['created_at'],
    flow_versions: ['created_at'],
    flow_work_orders: ['created_at'],
    idea_submissions: ['created_at'],
    project_flows: ['created_at'],
    objective_revisions: ['revised_at'],
    project_objective_baseline_scores: ['scored_at'],
    project_objective_actual_scores: ['scored_at'],
    ideas: ['risks', 'assumptions', 'alignments'],
    projects: [
        'business_context',
        'timeline_label',
        'estimated_duration',
        'actual_duration',
    ],
    organization: [
        'projects_current',
        'ideas_current',
        'storage_current',
        'storage_limit',
        'ai_credits_current',
        'ai_credits_limit',
        'active_people',
    ],
};

export const RETIRED_TABLES: readonly string[] = [
    'activities',
    'activity_actors',
    'identity_default_orgs',
    'organization',
];

// State-event values the alphabet has retired. Old
// snapshots carrying them in the states table are
// rejected with SnapshotIncompatibleError.
export const RETIRED_STATE_VALUES_PER_ENTITY:
    Record<string, readonly string[]> = {
    ideas: [
        'active:incomplete',
        'active:needs-info',
        'active:ready',
        'in-review',
        'sent-back',
    ],
    projects: [
        'under-review',
        'sent-back',
    ],
};

export class SnapshotIncompatibleError extends Error {
    readonly retired: readonly string[];
    constructor(retired: readonly string[]) {
        super(
            'Snapshot contains retired fields: '
            + retired.join(', ')
            + '. Re-snapshot from current state.',
        );
        this.name = 'SnapshotIncompatibleError';
        this.retired = retired;
    }
}

function scanForRetiredKeys(
    parsed: unknown,
): string[] {
    const findings: string[] = [];
    if (!parsed || typeof parsed !== 'object') {
        return findings;
    }
    const snap = parsed as Record<string, unknown>;
    for (const table of RETIRED_TABLES) {
        if (table in snap) {
            findings.push(table);
        }
    }
    for (const [table, keys] of Object.entries(
        RETIRED_KEYS_PER_TABLE,
    )) {
        const rows = snap[table];
        if (!Array.isArray(rows)) continue;
        const seen = new Set<string>();
        for (const row of rows) {
            if (!row || typeof row !== 'object') {
                continue;
            }
            for (const key of keys) {
                if (key in row && !seen.has(key)) {
                    findings.push(table + '.' + key);
                    seen.add(key);
                }
            }
        }
    }
    const retiredStates = new Set<string>();
    for (const values of Object.values(
        RETIRED_STATE_VALUES_PER_ENTITY,
    )) {
        for (const v of values) {
            retiredStates.add(v);
        }
    }
    const stateRows = snap['states'];
    if (Array.isArray(stateRows)) {
        const seenStates = new Set<string>();
        for (const row of stateRows) {
            if (!row || typeof row !== 'object') {
                continue;
            }
            const r = row as Record<string, unknown>;
            const v = r['state'];
            if (
                typeof v === 'string'
                && retiredStates.has(v)
                && !seenStates.has(v)
            ) {
                findings.push(
                    'states[].state=' + v,
                );
                seenStates.add(v);
            }
        }
    }
    return findings;
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

export async function postMockDataLoad(
    ctx: RequestContext,
): Promise<SeededCredentials> {
    return ctx.POST<SeededCredentials>(
        'snapshots/mock-data', {},
    );
}

export async function postBootstrap(
    ctx: RequestContext,
): Promise<SeededCredentials> {
    return ctx.POST<SeededCredentials>(
        'snapshots/bootstrap', {},
    );
}

export async function putSnapshot(
    ctx: RequestContext,
    json: string,
): Promise<void> {
    const findings = scanForRetiredKeys(
        JSON.parse(json),
    );
    if (findings.length > 0) {
        throw new SnapshotIncompatibleError(findings);
    }
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
export async function getHasAnyHumanMembers(
    ctx: RequestContext,
): Promise<boolean> {
    // The snapshots page is infrastructure-tier — it runs
    // before any session exists (it installs the datastore).
    // The snapshot plane is bearer-exempt ONLY while no
    // schema exists, so the pristine path works without
    // authentication; `null` = no schema = no data.
    let snapshot: string | null;
    try {
        snapshot =
            await ctx.GET<string | null>('snapshots/schema');
    } catch (err) {
        // A partial/incompatible schema throws MissingTableError
        // on export; treat it as "no usable data" so the
        // recovery page still renders its seed/import controls.
        if (err instanceof MissingTableError) return false;
        // Once a schema exists the plane is bearer-closed: an
        // auth denial IS the schema's existence, disclosed.
        // Read it as "data present" so the page never offers
        // a destructive seed over real data it cannot see.
        if (err instanceof UnauthorizedError) return true;
        if (err instanceof RequestError
            && err.status === 403) return true;
        throw err;
    }
    if (snapshot === null) {
        return false;
    }
    const tables = JSON.parse(snapshot) as {
        members?: unknown[];
    };
    return Array.isArray(tables.members)
        && tables.members.length > 0;
}
