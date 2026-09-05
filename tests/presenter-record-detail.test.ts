import {
    assertEquals,
    assertMatch,
    assertNotMatch,
} from '@std/assert';
import {
    RecordDetailPresenter,
    RecordDetailEditPresenter,
    allowedConstraintKinds,
    type AttributeDraft,
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

function editPageWith(attribute: AttributeDraft): string {
    return new RecordDetailEditPresenter(
        {
            name: 'Account Review',
            description: 'Quarterly review subject',
            attributes: [attribute],
        },
        '',
    ).buildPage().toString();
}

Deno.test(
    'allowedConstraintKinds offers regex to text, the'
    + ' range pair to number and date, and nothing else',
    () => {
        assertEquals(allowedConstraintKinds('text'), ['regex']);
        assertEquals(
            allowedConstraintKinds('number'),
            ['range_min', 'range_max'],
        );
        assertEquals(
            allowedConstraintKinds('date'),
            ['range_min', 'range_max'],
        );
        assertEquals(allowedConstraintKinds('select'), []);
        assertEquals(allowedConstraintKinds('radio'), []);
        assertEquals(allowedConstraintKinds('checkbox'), []);
    },
);

Deno.test(
    'a text attribute already holding a regex still'
    + ' offers regex in the picker',
    () => {
        const page = editPageWith({
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'Code',
            attributeType: 'text',
            sortOrder: 0,
            options: [],
            constraints: [
                { kind: 'regex', pattern: '^[A-Z]+$' },
            ],
        });
        assertMatch(page, /data-action="constraint-kind"/);
        assertMatch(page, /<option\s+value="regex"/);
    },
);

Deno.test(
    'a select attribute renders no constraint picker',
    () => {
        const page = editPageWith({
            id: 'rbfHGatkwQzGZJVXKJEeyw',
            name: 'Tier',
            attributeType: 'select',
            sortOrder: 0,
            options: ['Gold', 'Silver'],
            constraints: [],
        });
        assertNotMatch(page, /data-action="constraint-kind"/);
    },
);
