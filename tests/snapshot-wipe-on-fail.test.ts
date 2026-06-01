import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    LocalStorageDbAdapter,
} from '../api/db-localstorage.ts';

const KEY_PREFIX = 'fusion-ai:';

interface FailingShim {
    map: Map<string, string>;
    callCount: { value: number };
}

function installFailingShim(
    failOnSetCall: number,
): FailingShim {
    const map = new Map<string, string>();
    const callCount = { value: 0 };
    (globalThis as unknown as {
        localStorage: {
            getItem(k: string): string | null;
            setItem(k: string, v: string): void;
            removeItem(k: string): void;
        };
    }).localStorage = {
        getItem(key) {
            return map.get(key) ?? null;
        },
        setItem(key, value) {
            callCount.value += 1;
            if (
                callCount.value === failOnSetCall
            ) {
                throw new Error(
                    'simulated quota error',
                );
            }
            map.set(key, value);
        },
        removeItem(key) {
            map.delete(key);
        },
    };
    return { map, callCount };
}

test(
    'wipes table keys when setItem fails mid-import',
    async () => {
        // Fail on the 3rd setItem call — by then
        // a couple of tables have been written
        // and we want to confirm those get wiped.
        const shim = installFailingShim(3);
        const adapter = new LocalStorageDbAdapter();
        await adapter.initialize();

        // Pre-populate one entry to confirm it
        // also gets wiped as part of the failure
        // recovery.
        shim.map.set(
            KEY_PREFIX + 'workers',
            '[]',
        );

        const snapshot = JSON.stringify({
            workers: [],
            ideas: [],
            projects: [],
            flows: [],
            flow_versions: [],
            project_flows: [],
            work_orders: [],
            flow_work_orders: [],
            states: [],
            state_field_values: [],
            organization: [],
            idea_submissions: [],
            deleted: [],
        });

        await assert.rejects(
            () => adapter.importSnapshot(snapshot),
        );

        // No fusion-ai:* table keys remain.
        for (const key of shim.map.keys()) {
            assert.ok(
                !key.startsWith(KEY_PREFIX),
                'leftover key after wipe: ' + key,
            );
        }
    },
);
