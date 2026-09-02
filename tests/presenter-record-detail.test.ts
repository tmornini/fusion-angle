import { assertMatch, assertNotMatch } from '@std/assert';
import {
    RecordDetailPresenter,
} from '../web-app/app/presenters/record-detail.ts';
import { RecordModel } from '../api/types.ts';
import type { RecordState } from '../api/types.ts';

function pageFor(
    state: RecordState,
    roles: readonly string[],
): string {
    const model = new RecordModel(
        {
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            organization_id:
                'AjdvjuECVZEgZoFajaIEkg',
            name: 'Account Review',
            description: 'Quarterly review subject',
            position: 1,
            state,
        },
        { state },
    );
    return new RecordDetailPresenter({
        record: model,
        attributes: [],
        boundFlows: [],
        workOrders: [],
        instances: {
            instances: [],
            editing: null,
        },
        roles,
    }).buildPage().toString();
}

Deno.test(
    'an active record offers Archive through the'
    + ' house dialog',
    () => {
        const html = pageFor('active', ['admin']);
        assertMatch(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assertMatch(
            html, /id="record-archive-btn"/,
        );
        assertMatch(html, /Active/);
    },
);

Deno.test(
    'an archived record hides Archive and reads'
    + ' Archived',
    () => {
        const html = pageFor('archived', ['admin']);
        assertNotMatch(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assertNotMatch(html, /Active/);
        assertMatch(html, /Archived/);
    },
);

Deno.test(
    'Edit and Archive render for an admin and for'
    + ' nobody else',
    () => {
        const admin = pageFor('active', ['admin']);
        assertMatch(admin, /id="record-edit-btn"/);
        assertMatch(admin, /id="record-archive-btn"/);
        const member = pageFor('active', ['member']);
        assertNotMatch(
            member, /id="record-edit-btn"/,
        );
        assertNotMatch(
            member, /id="record-archive-btn"/,
        );
    },
);
