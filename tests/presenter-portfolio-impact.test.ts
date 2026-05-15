import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PortfolioImpactPresenter } from
    '../web-app/app/presenters/portfolio-impact.ts';

test('renders both arc segments when both means present',
    () => {
        const p = new PortfolioImpactPresenter({
            baselineMean: 19,
            actualMean: 12,
            projectCount: 5,
            actualCount: 3,
        });
        const html = p.buildCard().toString();
        assert.ok(html.includes('+19'));
        assert.ok(html.includes('+12'));
        assert.ok(html.includes(
            'portfolio-impact-arc-outer',
        ));
        assert.ok(html.includes(
            'portfolio-impact-arc-inner',
        ));
    });

test('renders no value arcs when both means undefined',
    () => {
        const p = new PortfolioImpactPresenter({
            baselineMean: undefined,
            actualMean: undefined,
            projectCount: 0,
            actualCount: 0,
        });
        const html = p.buildCard().toString();
        assert.ok(!html.includes(
            'class="portfolio-impact-arc-outer"',
        ));
        assert.ok(html.includes('—'));
    });

test('positive baseline → data-tone="positive"', () => {
    const p = new PortfolioImpactPresenter({
        baselineMean: 30, actualMean: 20,
        projectCount: 1, actualCount: 1,
    });
    const html = p.buildCard().toString();
    assert.ok(html.includes('data-tone="positive"'));
});

test('negative baseline → data-tone="negative"', () => {
    const p = new PortfolioImpactPresenter({
        baselineMean: -30, actualMean: -20,
        projectCount: 1, actualCount: 1,
    });
    const html = p.buildCard().toString();
    assert.ok(html.includes('data-tone="negative"'));
});
