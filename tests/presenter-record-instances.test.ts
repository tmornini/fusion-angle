import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    RecordInstancesPresenter,
    projectInstanceFields,
    type InstanceFieldView,
    type InstanceListItemView,
} from '../web-app/app/presenters/record-detail.ts';

// Instances section SafeHtml (Task 22): empty state,
// projected list values, edit form access modes.

function listItem(
    id: string,
    fields: InstanceListItemView['fields'],
): InstanceListItemView {
    return { id, fields };
}

function field(
    partial: InstanceFieldView,
): InstanceFieldView {
    return partial;
}

Deno.test('empty instances section shows empty state', () => {
    const html = new RecordInstancesPresenter({
        instances: [],
        editing: null,
    }).buildCard().toString();
    assertMatch(html, /Instances/);
    assertMatch(html, /No instances yet/);
    assertMatch(
        html, /id="record-new-instance-btn"/,
    );
    assertNotMatch(
        html, /data-instance-id/,
    );
});

Deno.test(
    'list renders instance id and projected values',
    () => {
        const html = new RecordInstancesPresenter({
            instances: [
                listItem('inst-1', [
                    {
                        name: 'Title',
                        value: 'Alpha',
                    },
                    {
                        name: 'Secret',
                        value: 'hidden-ok',
                    },
                ]),
            ],
            editing: null,
        }).buildCard().toString();
        assertMatch(html, /data-instance-id="inst-1"/);
        assertMatch(html, /inst-1/);
        assertMatch(html, /Title/);
        assertMatch(html, /Alpha/);
        assertMatch(html, /Secret/);
        assertMatch(html, /hidden-ok/);
        assertMatch(
            html,
            /data-action="edit-instance"/,
        );
        assertMatch(
            html,
            /data-dialog-open="confirm-delete-instance"/,
        );
    },
);

Deno.test(
    'edit form: writable input, readonly text,'
    + ' unreadable omitted',
    () => {
        const html = new RecordInstancesPresenter({
            instances: [],
            editing: {
                instanceId: 'inst-9',
                fields: [
                    field({
                        attributeId: 'a-write',
                        name: 'Writable',
                        value: 'xdaJyuuPyHfffCGLhqDrOQ',
                        access: 'writable',
                        attributeType: 'text',
                        options: [],
                    }),
                    field({
                        attributeId: 'a-read',
                        name: 'ReadOnly',
                        value: 'rOEPOcVMQdJiiiMuiiEhlg',
                        access: 'readonly',
                        attributeType: 'text',
                        options: [],
                    }),
                ],
                conflictNotice: null,
            },
        }).buildCard().toString();
        assertMatch(html, /inst-9/);
        assertMatch(
            html, /data-attribute-id="a-write"/,
        );
        assertMatch(
            html,
            /data-action="instance-field-value"/,
        );
        assertMatch(html, /value="xdaJyuuPyHfffCGLhqDrOQ"/);
        assertMatch(
            html, /data-attribute-id="a-read"/,
        );
        assertMatch(html, /ReadOnly/);
        assertMatch(html, /rOEPOcVMQdJiiiMuiiEhlg/);
        // Only one editable instance field input
        // (writable); readonly is display-only.
        const fieldInputs = html.match(
            /data-action="instance-field-value"/g,
        );
        assertStrictEquals(fieldInputs?.length, 1);
        // unreadable never present
        assertNotMatch(html, /a-secret/);
        assertNotMatch(html, /Unreadable/);
        assertMatch(
            html, /id="record-instance-save-btn"/,
        );
        assertMatch(
            html, /id="record-instance-cancel-btn"/,
        );
    },
);

Deno.test(
    'edit form surfaces 412 conflict notice',
    () => {
        const notice =
            'This instance changed underneath you'
            + ' — values refreshed; re-apply your'
            + ' edit';
        const html = new RecordInstancesPresenter({
            instances: [],
            editing: {
                instanceId: 'inst-c',
                fields: [
                    field({
                        attributeId: 'UQTJZvCoKlFjEoDlDUwekw',
                        name: 'Title',
                        value: 'fresh',
                        access: 'writable',
                        attributeType: 'text',
                        options: [],
                    }),
                ],
                conflictNotice: notice,
            },
        }).buildCard().toString();
        assertMatch(
            html, /data-tone="warning"/,
        );
        assertMatch(
            html, /values refreshed; re-apply/,
        );
    },
);

Deno.test(
    'projectInstanceFields drops unreadable and'
    + ' marks write vs read',
    () => {
        const projected = projectInstanceFields(
            [
                {
                    id: 'w',
                    name: 'Write',
                    readRoles: ['member'],
                    writeRoles: ['member'],
                    attributeType: 'text',
                    options: [],
                },
                {
                    id: 'r',
                    name: 'Read',
                    readRoles: ['member'],
                    writeRoles: ['admin'],
                    attributeType: 'text',
                    options: [],
                },
                {
                    id: 'x',
                    name: 'Hidden',
                    readRoles: ['admin'],
                    writeRoles: ['admin'],
                    attributeType: 'text',
                    options: [],
                },
            ],
            new Map([
                ['w', 'wv'],
                ['r', 'rv'],
                ['x', 'xv'],
            ]),
            ['member'],
        );
        assertEquals(
            projected.map(f => ({
                id: f.attributeId,
                access: f.access,
                value: f.value,
            })),
            [
                {
                    id: 'w',
                    access: 'writable',
                    value: 'wv',
                },
                {
                    id: 'r',
                    access: 'readonly',
                    value: 'rv',
                },
            ],
        );
    },
);

Deno.test(
    'projectInstanceFields: admin bypasses ACL',
    () => {
        const projected = projectInstanceFields(
            [
                {
                    id: 'x',
                    name: 'Hidden',
                    readRoles: ['admin'],
                    writeRoles: ['admin'],
                    attributeType: 'text',
                    options: [],
                },
            ],
            new Map([['x', 'secret']]),
            ['admin'],
        );
        assertStrictEquals(projected.length, 1);
        assertStrictEquals(
            projected[0]!.access, 'writable',
        );
    },
);

Deno.test(
    'edit form: select attribute renders a select',
    () => {
        const html = new RecordInstancesPresenter({
            instances: [],
            editing: {
                instanceId: 'inst-s',
                fields: [
                    field({
                        attributeId: 'a-choice',
                        name: 'choice',
                        value: 'b',
                        access: 'writable',
                        attributeType: 'select',
                        options: ['a', 'b', 'c'],
                    }),
                ],
                conflictNotice: null,
            },
        }).buildCard().toString();
        assertMatch(html, /<select/);
        assertMatch(
            html, /data-attribute-id="a-choice"/,
        );
        assertMatch(html, /value="b"/);
        assertMatch(html, /selected/);
        assertNotMatch(
            html, /<input type="text"/,
        );
    },
);

Deno.test(
    'edit form: radio attribute renders radios',
    () => {
        const html = new RecordInstancesPresenter({
            instances: [],
            editing: {
                instanceId: 'inst-r',
                fields: [
                    field({
                        attributeId: 'a-radio',
                        name: 'pick',
                        value: 'yes',
                        access: 'writable',
                        attributeType: 'radio',
                        options: ['yes', 'no'],
                    }),
                ],
                conflictNotice: null,
            },
        }).buildCard().toString();
        assertMatch(html, /type="radio"/);
        assertMatch(
            html, /data-attribute-id="a-radio"/,
        );
        assertNotMatch(
            html, /<input type="text"/,
        );
    },
);
