import { assertEquals } from '@std/assert';
import type { RecordInstance } from '../client/index.ts';
import { instanceToDelete } from '../web-app/records/detail.ts';
import { responseMessage } from './fixtures/response-message.ts';

const TYPE_ID = 'rbfHGatkwQzGZJVXKJEeyw';

function instance(id: string): RecordInstance {
    return {
        id,
        recordTypeId: TYPE_ID,
        values: new Map(),
        message: responseMessage({
            id,
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            record_type_id: TYPE_ID,
            values: [],
        }),
    };
}

Deno.test(
    'a confirmed delete targets the row the list holds',
    () => {
        const kept = instance('UQBiHFcwJeCDSnmkPBoYRA');
        const other = instance('fndCYAsXazdzMUlEGMNIZw');
        assertEquals(
            instanceToDelete([other, kept], kept.id),
            { kind: 'present', instance: kept },
        );
    },
);

Deno.test(
    'a confirmed delete whose row left the list is gone',
    () => {
        const other = instance('fndCYAsXazdzMUlEGMNIZw');
        assertEquals(
            instanceToDelete([other], 'UQBiHFcwJeCDSnmkPBoYRA'),
            { kind: 'gone' },
        );
    },
);
