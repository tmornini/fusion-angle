import { $ } from '../app/dom.ts';
import {
    html,
    mutateHtml,
} from '../app/safe-html.ts';
import {
    iconActivity,
    iconSearch,
} from '../app/icons.ts';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states.ts';
import {
    getActivityRows,
    getActivityActorRows,
    getUserMap,
    userName,
    createFetchContext,
} from '../app/adapters/index.ts';
import {
    ActivityPresenter,
} from '../app/presenters/index.ts';

export async function init(
): Promise<void> {
    const container = $(
        '#activity-feed-content', document,
    );
    if (!container) return;

    const ctx = createFetchContext();
    const items =
        await withLoadingState(
            container,
            buildSkeleton('card-list', 6),
            async () => {
                const [
                    rows, actors, userMap,
                ] = await Promise.all([
                    getActivityRows(),
                    getActivityActorRows(),
                    getUserMap(ctx),
                ]);
                const actorMap = new Map(
                    actors.map(a => [
                        a.activity_id,
                        a.user_id,
                    ]),
                );
                return rows.map(row => {
                    const actorId =
                        actorMap.get(row.id);
                    if (!actorId) {
                        throw new Error(
                            'Activity has'
                            + ' no actor: '
                            + row.id,
                        );
                    }
                    return new ActivityPresenter(
                        row,
                        userName(
                            userMap, actorId,
                        ),
                    );
                });
            },
            () => init(),
            {
                icon: iconActivity(24, ''),
                title: 'No Activity Yet',
                description:
                    'Activity from your'
                    + ' team will appear'
                    + ' here as they work'
                    + ' on ideas and'
                    + ' projects.',
            },
        );
    if (!items) return;
    const presenters = items;

    mutateHtml(container, html`
    <div class="content-wrap">
        <div class="flex items-center
            gap-4 mb-6">
            <div class="search-wrapper flex-1">
                <span class="search-icon">${
                    iconSearch(16, '')}</span>
                <input class="input search-input"
                    placeholder="Search activity..."
                    id="activity-search"
                    aria-label="Search activity"
                />
            </div>
            <select class="input input-narrow"
                id="activity-filter"
                aria-label="Filter by activity type">
                <option value="all"
                    >All Activity</option>
                <option value="idea"
                    >Ideas</option>
                <option value="project"
                    >Projects</option>
                <option value="team"
                    >Teams</option>
            </select>
        </div>

        <div id="activity-list">
            ${presenters.map(
                a => a.buildActivity(),
            )}
        </div>

        <div class="text-center mt-8">
            <button class="btn btn-outline"
                >Load More Activity</button>
        </div>
    </div>`);

    const activityList = $(
        '#activity-list', container,
    );
    const searchInput =
        container.querySelector<
            HTMLInputElement
        >('#activity-search')!;
    const typeFilter =
        container.querySelector<
            HTMLSelectElement
        >('#activity-filter')!;

    const typeMap: Record<string, string[]> = {
        idea: [
            'idea_created',
            'idea_converted',
        ],
        project: ['project_created'],
        team: [
            'user_joined',
            'status_changed',
        ],
    };

    function filterActivities(): void {
        if (!activityList) return;
        const query =
            searchInput.value
                .toLowerCase();
        const typeVal = typeFilter.value;
        const types = typeVal !== 'all'
            ? typeMap[typeVal]
            : undefined;
        const filtered = presenters.filter(
            a => a.matchesFilter(
                query, types,
            ),
        );
        mutateHtml(
            activityList,
            html`${filtered.map(
                a => a.buildActivity(),
            )}`,
        );
    }

    searchInput.addEventListener(
        'input', filterActivities,
    );
    typeFilter.addEventListener(
        'change', filterActivities,
    );
}
