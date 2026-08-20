import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test('empty instances section shows empty state', () => {
    const html = new RecordInstancesPresenter({
        instances: [],
        editing: null,
    }).buildCard().toString();
    assert.match(html, /Instances/);
    assert.match(html, /No instances yet/);
    assert.match(
        html, /id="record-new-instance-btn"/,
    );
    assert.doesNotMatch(
        html, /data-instance-id/,
    );
});

test(
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
        assert.match(html, /data-instance-id="inst-1"/);
        assert.match(html, /inst-1/);
        assert.match(html, /Title/);
        assert.match(html, /Alpha/);
        assert.match(html, /Secret/);
        assert.match(html, /hidden-ok/);
        assert.match(
            html,
            /data-action="edit-instance"/,
        );
        assert.match(
            html,
            /data-dialog-open="confirm-delete-instance"/,
        );
    },
);

test(
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
                        value: 'w1',
                        access: 'writable',
                        attributeType: 'text',
                        options: [],
                    }),
                    field({
                        attributeId: 'a-read',
                        name: 'ReadOnly',
                        value: 'r1',
                        access: 'readonly',
                        attributeType: 'text',
                        options: [],
                    }),
                ],
                conflictNotice: null,
            },
        }).buildCard().toString();
        assert.match(html, /inst-9/);
        assert.match(
            html, /data-attribute-id="a-write"/,
        );
        assert.match(
            html,
            /data-action="instance-field-value"/,
        );
        assert.match(html, /value="w1"/);
        assert.match(
            html, /data-attribute-id="a-read"/,
        );
        assert.match(html, /ReadOnly/);
        assert.match(html, /r1/);
        // Only one editable instance field input
        // (writable); readonly is display-only.
        const fieldInputs = html.match(
            /data-action="instance-field-value"/g,
        );
        assert.equal(fieldInputs?.length, 1);
        // unreadable never present
        assert.doesNotMatch(html, /a-secret/);
        assert.doesNotMatch(html, /Unreadable/);
        assert.match(
            html, /id="record-instance-save-btn"/,
        );
        assert.match(
            html, /id="record-instance-cancel-btn"/,
        );
    },
);

test(
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
                        attributeId: 'a1',
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
        assert.match(
            html, /data-tone="warning"/,
        );
        assert.match(
            html, /values refreshed; re-apply/,
        );
    },
);

test(
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
        assert.deepEqual(
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

test(
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
        assert.equal(projected.length, 1);
        assert.equal(
            projected[0]!.access, 'writable',
        );
    },
);

test(
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
        assert.match(html, /<select/);
        assert.match(
            html, /data-attribute-id="a-choice"/,
        );
        assert.match(html, /value="b"/);
        assert.match(html, /selected/);
        assert.doesNotMatch(
            html, /<input type="text"/,
        );
    },
);

test(
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
        assert.match(html, /type="radio"/);
        assert.match(
            html, /data-attribute-id="a-radio"/,
        );
        assert.doesNotMatch(
            html, /<input type="text"/,
        );
    },
);
