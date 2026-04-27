import { $ } from '../app/dom';
import {
    html,
    mutateHtml,
} from '../app/safe-html';
import {
    iconActivity,
    iconSearch,
} from '../app/icons';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    getActivityFeed,
} from '../app/adapters';
import {
    ActivityPresenter,
} from '../app/presenters';

export async function init(
): Promise<void> {
    const container = $(
        '#activity-feed-content', document,
    );
    if (!container) return;

    const activities =
        await withLoadingState(
            container,
            buildSkeleton('card-list', 6),
            getActivityFeed,
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
    if (!activities) return;
    const items = activities.map(
        a => new ActivityPresenter(a),
    );

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
            ${items.map(
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
        const filtered = items.filter(
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
