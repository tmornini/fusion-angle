import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OrganizationObjectivesPresenter } from
    '../web-app/app/presenters/organization-objectives.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const deprecatedObjs = [
    { id: 'o3', position: 99 },
];
const defs = new Map([
    ['o1', { name: 'Revenue Growth', description: 'd1' }],
    ['o2', { name: 'Cost Reduction', description: 'd2' }],
    ['o3', { name: 'Old Quarterly', description: 'd3' }],
]);
const deprecatedAt = new Map([
    ['o3', '2026-03-15T00:00:00.000Z'],
]);

test('renders active section with each active objective',
    () => {
        const p = new OrganizationObjectivesPresenter(
            activeObjs, deprecatedObjs, defs, deprecatedAt,
        );
        const html = p.buildBox().toString();
        assert.ok(html.includes('Revenue Growth'));
        assert.ok(html.includes('Cost Reduction'));
        assert.ok(html.includes('data-objective-id="o1"'));
        assert.ok(html.includes('data-objective-id="o2"'));
    });

test('renders deprecated section under active', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, deprecatedObjs, defs, deprecatedAt,
    );
    const html = p.buildBox().toString();
    assert.ok(html.includes('Old Quarterly'));
    assert.ok(html.includes('Deprecated'));
});

test('renders add-objective affordance', () => {
    const p = new OrganizationObjectivesPresenter(
        activeObjs, deprecatedObjs, defs, deprecatedAt,
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
