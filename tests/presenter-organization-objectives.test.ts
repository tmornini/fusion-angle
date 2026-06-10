import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OrganizationObjectivesPresenter } from
    '../web-app/app/presenters/organization-objectives.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const archivedObjs = [
    { id: 'o3', position: 99 },
];
const defs = new Map([
    ['o1', { name: 'Increase incomes', description: 'd1' }],
    ['o2', { name: 'Lower expenses', description: 'd2' }],
    ['o3', { name: 'Old Quarterly', description: 'd3' }],
]);
const archivedAt = new Map([
    ['o3', '2026-03-15T00:00:00.000000Z'],
]);

test('renders active section with each active objective',
    () => {
        const p = new OrganizationObjectivesPresenter(
            activeObjs, archivedObjs, defs, archivedAt,
        );
        const html = p.buildBox().toString();
        assert.ok(html.includes('Increase incomes'));
        assert.ok(html.includes('Lower expenses'));
        assert.ok(html.includes('data-objective-id="o1"'));
        assert.ok(html.includes('data-objective-id="o2"'));
    });

test('renders archived section under active', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, archivedObjs, defs, archivedAt,
    );
    const html = p.buildBox().toString();
    assert.ok(html.includes('Old Quarterly'));
    assert.ok(html.includes('Archived'));
});

test('renders add-objective affordance', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, archivedObjs, defs, archivedAt,
    );
    const html = p.buildBox().toString();
    assert.ok(html.includes('data-action="add-objective"'));
});

test('empty state when no objectives', () => {
    const p = new OrganizationObjectivesPresenter(
        [], [], new Map(), new Map(),
    );
    const html = p.buildBox().toString();
    assert.ok(html.toLowerCase().includes('no objectives'));
});
