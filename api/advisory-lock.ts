// 52-bit pg_advisory_xact_lock keys from SHA-256 of
// lock-name labels. Labels are UTF-8 text, not Latin-1
// wire. A collision only serializes unrelated work.

import { sha256Hex } from '../shared/digest.ts';
import type { NotificationEvent } from
    './notifications.ts';

export const ADVISORY_KEY_HEX_DIGITS = 13;

export const SNAPSHOT_IMPORT_LOCK_NAME =
    'fusion.snapshot.import';

export const FUSION_EVENTS_CHANNEL = 'fusion_events';

export const PG_NOTIFY_PAYLOAD_MAX_BYTES = 8000;

export const POOL_MAX = 10;

export const SNAPSHOT_EXPORT_ISOLATION =
    'ISOLATION LEVEL REPEATABLE READ READ ONLY';

export function notifyPayload(
    event: NotificationEvent,
): string {
    const json = JSON.stringify(event);
    const size = new TextEncoder().encode(json).length;
    if (size > PG_NOTIFY_PAYLOAD_MAX_BYTES) {
        return '{"kind":"full"}';
    }
    return json;
}

export async function advisoryKey(
    label: string,
): Promise<bigint> {
    const hex = (await sha256Hex(label))
        .slice(0, ADVISORY_KEY_HEX_DIGITS);
    return BigInt('0x' + hex);
}
