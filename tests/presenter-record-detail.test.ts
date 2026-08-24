import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    RecordDetailPresenter,
} from '../web-app/app/presenters/record-detail.ts';
import { RecordModel } from '../api/types.ts';
import type { RecordState } from '../api/types.ts';

function pageFor(state: RecordState): string {
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
    }).buildPage().toString();
}

test(
    'an active record offers Archive through the'
    + ' house dialog',
    () => {
        const html = pageFor('active');
        assert.match(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assert.match(
            html, /id="record-archive-btn"/,
        );
        assert.match(html, /Active/);
    },
);

test(
    'an archived record hides Archive and reads'
    + ' Archived',
    () => {
        const html = pageFor('archived');
        assert.doesNotMatch(
            html,
            /data-dialog-open="confirm-archive"/,
        );
        assert.doesNotMatch(html, /Active/);
        assert.match(html, /Archived/);
    },
);
