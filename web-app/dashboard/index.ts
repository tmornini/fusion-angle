import { $, $required } from '../app/dom.ts';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import { getDashboardGauges } from '../app/dashboard.ts';
import {
    startDashboardScoringReads,
    getObjectiveScoringInputs,
    activeObjectivesOf,
    subscribeProjectScoreChanges,
    getCurrentObjectiveDefinitions,
    subscribeObjectiveChanges,
    subscribeProjectChanges,
    type DashboardScoringBundle,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    buildObjectiveAggregates,
    buildObjectiveTrendlines,
    buildProjectObjectiveRows,
} from '../app/scoring-aggregate.ts';
import {
    GaugePresenter,
    DashboardObjectiveAggregatesPresenter,
    DashboardObjectiveProjectsPresenter,
} from '../app/presenters/index.ts';
import {
    fetchMeasureName,
    markEnd,
    markStart,
    renderMeasureName,
} from '../app/page-performance.ts';
import { objectiveCardHit } from
    './objective-card-hit.ts';

type ObjectiveDefs = Awaited<
    ReturnType<typeof getCurrentObjectiveDefinitions>
>;

let openObjectiveId: string | null = null;
let objectiveCardBound = false;

function definitionsFrom(
    ctx: ReturnType<typeof sessionContext>,
    objectivesP: Promise<
        DashboardScoringBundle['objectives']
    >,
): Promise<ObjectiveDefs> {
    return objectivesP.then(objectives =>
        getCurrentObjectiveDefinitions(
            ctx,
            activeObjectivesOf(objectives)
                .map(m => m.body().toValue().id),
        ),
    );
}

function objectiveCardTarget(
    event: Event,
): Element | null {
    const target = event.target;
    if (
        target === null
        || typeof (target as Element).closest
            !== 'function'
    ) {
        return null;
    }
    return target as Element;
}

function activateObjectiveCard(event: Event): void {
    const target = objectiveCardTarget(event);
    if (target === null) return;
    const hit = objectiveCardHit(target);
    if (hit.kind === 'none') return;
    if (hit.kind === 'open') {
        event.preventDefault();
        openObjectiveId = hit.objectiveId;
    } else {
        openObjectiveId = null;
    }
    void renderObjectiveAggregates();
}

function onObjectiveCardClick(event: Event): void {
    activateObjectiveCard(event);
}

function onObjectiveCardKeydown(event: Event): void {
    const key = (event as KeyboardEvent).key;
    if (key !== 'Enter' && key !== ' ') return;
    activateObjectiveCard(event);
}

function bindObjectiveCard(): void {
    if (objectiveCardBound) return;
    const card = $required(
        '#objective-aggregates-card',
        document,
    );
    card.addEventListener(
        'click', onObjectiveCardClick,
    );
    card.addEventListener(
        'keydown', onObjectiveCardKeydown,
    );
    objectiveCardBound = true;
}

async function fillObjectiveAggregatesCard(
    bundleP: Promise<DashboardScoringBundle>,
    defsP: Promise<ObjectiveDefs>,
): Promise<void> {
    const fetchName = fetchMeasureName(
        'objective-aggregates-card',
    );
    markStart(fetchName);
    const [bundle, defs] = await Promise.all([
        bundleP,
        defsP,
    ]);
    const inputs = getObjectiveScoringInputs(bundle);
    const active = inputs.activeObjectives;
    const activeIds = active.map(
        message => message.body().toValue().id,
    );
    if (
        openObjectiveId !== null
        && !activeIds.includes(openObjectiveId)
    ) {
        openObjectiveId = null;
    }
    const aggregates = buildObjectiveAggregates(
        inputs,
    );
    const trendlines = buildObjectiveTrendlines(
        inputs,
    );
    markEnd(fetchName);
    const renderName = renderMeasureName(
        'objective-aggregates-card',
    );
    markStart(renderName);
    const openId = openObjectiveId;
    let card: SafeHtml;
    if (openId === null) {
        card = new DashboardObjectiveAggregatesPresenter(
            active, defs, aggregates, trendlines,
        ).buildCard();
    } else {
        const def = defs.get(openId);
        if (!def) {
            throw new Error(
                'objective definition missing for '
                + openId,
            );
        }
        const projects = bundle.projects.map(
            message => {
                const project = message.body()
                    .toValue();
                return {
                    id: project.id,
                    title: project.title,
                };
            },
        );
        card = new DashboardObjectiveProjectsPresenter(
            def.name,
            buildProjectObjectiveRows(
                inputs, projects, openId,
            ),
        ).buildCard();
    }
    setHtml(
        $('#objective-aggregates-card', document)!,
        card,
    );
    markEnd(renderName);
}

async function renderObjectiveAggregates(
): Promise<void> {
    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    await fillObjectiveAggregatesCard(
        bundleP,
        definitionsFrom(ctx, objectivesP),
    );
}

export async function init(
): Promise<void> {
    bindObjectiveCard();
    const container = $required(
        '#gauge-container', document,
    );

    const ctx = sessionContext();
    const { bundleP, objectivesP } =
        startDashboardScoringReads(ctx);
    const defsP = definitionsFrom(
        ctx, objectivesP,
    );
    await Promise.all([
        loadInto({
            container,
            skeleton: buildSkeleton('card-grid', 3),
            fetch: async () => getDashboardGauges(
                await bundleP,
            ),
            retry: () => init(),
            onData: gauges => {
                const rendered = gauges.map(
                    g => new GaugePresenter(g)
                        .render(),
                );
                setHtml(
                    container,
                    html`${rendered}`,
                );

                subscribeProjectScoreChanges(
                    renderObjectiveAggregates,
                );
                subscribeObjectiveChanges(
                    renderObjectiveAggregates,
                );
                subscribeProjectChanges(
                    renderObjectiveAggregates,
                );
            },
        }),
        fillObjectiveAggregatesCard(
            bundleP, defsP,
        ),
    ]);
}
