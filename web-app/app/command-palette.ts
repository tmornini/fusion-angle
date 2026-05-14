import {
    $,
} from './dom.ts';
import {
    html,
    setHtml,
    SafeHtml,
    trusted,
    escapeForHtml,
} from './safe-html.ts';
import {
    iconSearch,
    iconLightbulb,
    iconFolderKanban,
    iconPerson,
    iconX,
} from './icons.ts';
import {
    getIdeas,
    getProjects,
    getHumanWorkers,
    featuredHumanWorkers,
    createRequestContext,
    setLocation,
    subscribeSchemaChanges,
    type IdeaWithSubmitter,
    Project,
    HumanWorker,
} from './adapters/index.ts';
// init.ts is the composition root —
// intentionally outside the adapter barrel.
import {
    getDbAdapter,
} from './adapters/init.ts';
import {
    PAGE_REGISTRY,
} from './page-registry.ts';
import { buildPageUrl } from './navigation.ts';
import { pluralize } from './format.ts';
import { log } from './logger.ts';

export interface SearchItem {
    id: string;
    title: string;
    meta: string;
    category:
        | 'ideas'
        | 'projects'
        | 'workers'
        | 'pages';
    icon: SafeHtml;
    href: string;
    keywords: string;
}

interface PalettePageEntry {
    title: string;
    icon: SafeHtml;
    href: string;
    keywords: string;
}

const DEBOUNCE_MS = 100;
const PALETTE_ICON_SIZE_SM = 16;
const PALETTE_ICON_SIZE_LG = 20;
const PALETTE_DEFAULT_RESULT_COUNT = 12;

function buildPageList(
): PalettePageEntry[] {
    const result: PalettePageEntry[] = [];
    for (
        const [name, entry]
        of Object.entries(PAGE_REGISTRY)
    ) {
        if (entry.searchable === false)
            continue;
        if (!entry.keywords) continue;
        const iconFn = entry.icon;
        result.push({
            title: entry.title,
            icon: iconFn
                ? iconFn(
                    PALETTE_ICON_SIZE_SM, '',
                )
                : iconSearch(
                    PALETTE_ICON_SIZE_SM, '',
                ),
            href: buildPageUrl(name),
            keywords: entry.keywords,
        });
    }
    return result;
}

const pages: PalettePageEntry[] =
    buildPageList();

interface CommandPaletteState {
    isOpen: boolean;
    activeIndex: number;
    allItems: SearchItem[];
    filteredItems: SearchItem[];
    isDataLoaded: boolean;
    debounceTimeoutId:
        ReturnType<typeof setTimeout>
        | null;
    backdrop: HTMLElement | null;
    dialog: HTMLElement | null;
    input: HTMLInputElement | null;
    list: HTMLElement | null;
    liveRegion: HTMLElement | null;
    previousFocusElement:
        HTMLElement | null;
}

function buildHighlightedMatch(
    text: string,
    query: string,
): SafeHtml {
    if (!query.trim())
        return trusted(escapeForHtml(text));
    const escaped = escapeForHtml(text);
    const escapedQuery =
        escapeForHtml(query);
    const safePattern = escapeRegexMetachars(
        escapedQuery,
    );
    const highlightPattern = new RegExp(
        '(' + safePattern + ')',
        'gi',
    );
    return trusted(
        escaped.replace(
            highlightPattern,
            '<mark>$1</mark>',
        ),
    );
}

// Escape regex metacharacters so the
// user's literal query becomes a regex
// that matches itself, not a regex
// that interprets the query.
function escapeRegexMetachars(
    s: string,
): string {
    return s.replace(
        /[.*+?^${}()|[\]\\]/g, '\\$&',
    );
}

const categoryOrder:
    SearchItem['category'][] = [
        'ideas',
        'projects',
        'workers',
        'pages',
    ];
const categoryLabels:
    Record<string, string> = {
        ideas: 'Ideas',
        projects: 'Projects',
        workers: 'Workers',
        pages: 'Pages',
    };

function isCommandPaletteHotkey(
    e: KeyboardEvent,
): boolean {
    return (e.metaKey || e.ctrlKey)
        && e.key === 'k';
}

export function ideaToSearchItem(
    tuple: IdeaWithSubmitter,
): SearchItem {
    return {
        id: 'idea-' + tuple.idea.idForLink(),
        title: tuple.idea.titleText(),
        meta: tuple.idea.statusValue()
            .replace(/-/g, ' '),
        category: 'ideas',
        icon: iconLightbulb(
            PALETTE_ICON_SIZE_SM, '',
        ),
        href: buildPageUrl('idea-convert', {
            ideaId: tuple.idea.idForLink(),
        }),
        keywords: tuple.submitterName + ' '
            + tuple.idea.statusValue(),
    };
}

export function projectToSearchItem(
    project: Project,
): SearchItem {
    return {
        id: 'project-' + project.idForLink(),
        title: project.titleText(),
        meta: 'Progress: '
            + project.progressPercent()
            + '% · '
            + project.statusValue()
                .replace(/-/g, ' '),
        category: 'projects',
        icon: iconFolderKanban(
            PALETTE_ICON_SIZE_SM, '',
        ),
        href: buildPageUrl('project-detail', {
            projectId: project.idForLink(),
        }),
        keywords: project.statusValue(),
    };
}

export function humanWorkerToSearchItem(
    worker: HumanWorker,
): SearchItem {
    return {
        id: 'worker-' + worker.idForLink(),
        title: worker.fullName(),
        meta: worker.titleLabel()
            + ' · '
            + worker.departmentLabel(),
        category: 'workers',
        icon: iconPerson(
            PALETTE_ICON_SIZE_SM, '',
        ),
        href: buildPageUrl('workers'),
        keywords: worker.titleLabel()
            + ' ' + worker.departmentLabel()
            + ' ' + worker.emailAddress(),
    };
}

function pageToSearchItem(
    page: PalettePageEntry,
    index: number,
): SearchItem {
    return {
        id: 'page-' + index,
        title: page.title,
        meta: 'Page',
        category: 'pages',
        icon: page.icon,
        href: page.href,
        keywords: page.keywords,
    };
}

// Case-insensitive substring match across
// title/meta/keywords. When query is empty,
// returns the first PALETTE_DEFAULT_RESULT_COUNT
// items so the panel always shows something.
export function searchItems(
    items: readonly SearchItem[],
    query: string,
): SearchItem[] {
    if (!query.trim()) {
        return items.slice(
            0, PALETTE_DEFAULT_RESULT_COUNT,
        );
    }
    const needle = query.toLowerCase();
    return items.filter(
        item =>
            item.title.toLowerCase()
                .includes(needle)
            || item.meta.toLowerCase()
                .includes(needle)
            || item.keywords.toLowerCase()
                .includes(needle),
    );
}

export function initCommandPalette(
): void {
    const state: CommandPaletteState = {
        isOpen: false,
        activeIndex: 0,
        allItems: [],
        filteredItems: [],
        isDataLoaded: false,
        debounceTimeoutId: null,
        backdrop: null,
        dialog: null,
        input: null,
        list: null,
        liveRegion: null,
        previousFocusElement: null,
    };

    async function getSearchIndex(
    ): Promise<void> {
        if (state.isDataLoaded) return;
        state.isDataLoaded = true;

        const ctx = createRequestContext();
        const [ideas, projects, humans] =
            await Promise.all([
                getIdeas(ctx),
                getProjects(ctx),
                getHumanWorkers(ctx),
            ]);
        const featured =
            featuredHumanWorkers(humans);

        state.allItems = [
            ...ideas.map(ideaToSearchItem),
            ...projects.map(
                projectToSearchItem,
            ),
            ...featured.map(
                humanWorkerToSearchItem,
            ),
            ...pages.map(pageToSearchItem),
        ];
    }

    function mutateResults(
        query: string,
    ): void {
        if (!state.list) return;

        state.filteredItems = searchItems(
            state.allItems, query,
        );
        state.activeIndex = 0;

        if (
            state.filteredItems.length
            === 0
        ) {
            setHtml(
                state.list,
                html`<div
class="command-palette-empty"
>No results found for "${query}"</div>`,
            );
            if (state.liveRegion)
                state.liveRegion
                    .textContent =
                    'No results found';
            return;
        }

        const grouped: Partial<
            Record<
                SearchItem['category'],
                SearchItem[]
            >
        > = {};
        state.filteredItems.forEach(
            item => {
                if (!grouped[item.category]) {
                    grouped[item.category] = [];
                }
                grouped[item.category]!
                    .push(item);
            },
        );

        const markup: SafeHtml[] = [];
        let posIndex = 0;
        for (
            const category
            of categoryOrder
        ) {
            const items =
                grouped[category];
            if (!items?.length) continue;

            markup.push(
                html`<div
class="command-palette-group-label">${
categoryLabels[category]}</div>`,
            );
            for (
                const item of items
            ) {
                markup.push(
                    html`<div
class="command-palette-item"
role="option"
id="command-palette-item-${item.id}"
data-item-id="${item.id}"
data-href="${item.href}"
aria-posinset="${posIndex + 1}"
aria-setsize="${
state.filteredItems.length}"
aria-selected="${
posIndex === state.activeIndex
    ? 'true'
    : 'false'}">
    <div class="${
        'command-palette-item-icon'
    }">${item.icon}</div>
    <div class="${
        'command-palette-item-content'
    }">
        <div
            class="${
                'command-palette'
                + '-item-title'
            }">${
            buildHighlightedMatch(
                item.title,
                query,
            )}</div>
        <div
            class="${
                'command-palette'
                + '-item-meta'
            }">${item.meta}</div>
    </div>
</div>`,
                );
                posIndex++;
            }
        }

        setHtml(
            state.list,
            html`${markup}`,
        );
        if (state.liveRegion) {
            const count =
                state.filteredItems.length;
            state.liveRegion
                .textContent =
                `${count} `
                + `${pluralize(count, 'result')}`
                + ` found`;
        }
    }

    function mutateActiveItem(): void {
        if (!state.list) return;
        state.list
            .querySelectorAll(
                '.command-palette-item',
            )
            .forEach((el, i) => {
                el.setAttribute(
                    'aria-selected',
                    i === state.activeIndex
                        ? 'true'
                        : 'false',
                );
            });
        const activeItem =
            state.filteredItems[
                state.activeIndex
            ];
        if (activeItem) {
            const activeEl =
                state.list.querySelector(
                    `[data-item-id=`
                    + `"${activeItem.id}"]`,
                );
            if (activeEl)
                activeEl.scrollIntoView(
                    { block: 'nearest' },
                );
            if (state.input)
                state.input.setAttribute(
                    'aria-activedescendant',
                    'command-palette-item-'
                        + activeItem.id,
                );
        }
    }

    function moveActiveIndex(
        delta: number,
    ): void {
        const len =
            state.filteredItems.length;
        if (len === 0) return;
        let next = state.activeIndex + delta;
        if (next < 0) next += len;
        if (next >= len) next -= len;
        state.activeIndex = next;
        mutateActiveItem();
    }

    function navigateToItem(
        index: number,
    ): void {
        const item =
            state.filteredItems[index];
        if (!item) return;
        close();
        setLocation(item.href);
    }

    function open(): void {
        if (state.isOpen) return;
        state.isOpen = true;
        state.previousFocusElement =
            document.activeElement
                instanceof HTMLElement
                ? document.activeElement
                : null;

        if (!state.backdrop)
            initCommandPaletteDOM();
        state.backdrop
            ?.classList.remove('hidden');
        state.dialog
            ?.classList.remove('hidden');
        if (state.input) {
            state.input.value = '';
            state.input.focus();
        }

        getSearchIndex().then(
            () => mutateResults(''),
        );
    }

    function close(): void {
        if (!state.isOpen) return;
        state.isOpen = false;
        state.backdrop
            ?.classList.add('hidden');
        state.dialog
            ?.classList.add('hidden');
        if (state.previousFocusElement)
            state
                .previousFocusElement
                .focus();
    }

    function initCommandPaletteDOM(
    ): void {
        state.backdrop =
            document.createElement(
                'div',
            );
        state.backdrop.className =
            'command-palette-backdrop'
            + ' hidden';
        state.backdrop.addEventListener(
            'click',
            close,
        );

        state.dialog =
            document.createElement(
                'div',
            );
        state.dialog.className =
            'command-palette-dialog'
            + ' hidden';
        state.dialog.setAttribute(
            'role',
            'dialog',
        );
        state.dialog.setAttribute(
            'aria-modal',
            'true',
        );
        state.dialog.setAttribute(
            'aria-label',
            'Search',
        );

        setHtml(state.dialog, html`
    <div class="${
        'command-palette-input-wrapper'
    }">
        ${iconSearch(
            PALETTE_ICON_SIZE_LG, '',
        )}
        <input
            class="command-palette-input"
            placeholder="${
                'Search ideas, projects,'
                + ' workers, pages...'
            }"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="${
                'command-palette-listbox'
            }"
            aria-autocomplete="list" />
        <button
            class="${
                'btn btn-ghost'
                + ' btn-icon btn-xs'
            }"
            aria-label="Close"
            id="command-palette-close">${
            iconX(16, '')}</button>
    </div>
    <div class="command-palette-list"
        id="command-palette-listbox"
        role="listbox"
        aria-label="${
            'Search results'
        }"></div>
    <div class="${
        'command-palette-footer'
    }">
        <div class="${
            'flex items-center gap-3'
        }">
            ${trusted(
                '<span'
                + ' class="flex'
                + ' items-center'
                + ' gap-1">'
                + '<kbd>\u2191</kbd>'
                + '<kbd>\u2193</kbd>'
                + ' Navigate</span>',
            )}
            ${trusted(
                '<span'
                + ' class="flex'
                + ' items-center'
                + ' gap-1">'
                + '<kbd>\u21B5</kbd>'
                + ' Open</span>',
            )}
            ${trusted(
                '<span'
                + ' class="flex'
                + ' items-center'
                + ' gap-1">'
                + '<kbd>Esc</kbd>'
                + ' Close</span>',
            )}
        </div>
    </div>
    <div class="${
        'command-palette-live'
    }"
        role="status"
        aria-live="polite"
        aria-atomic="true"></div>`);

        state.input =
            state.dialog
                .querySelector<
                    HTMLInputElement
                >(
                    '.command-palette-input',
                );
        state.list =
            state.dialog.querySelector(
                '#command-palette-listbox',
            );
        state.liveRegion =
            state.dialog.querySelector(
                '.command-palette-live',
            );

        function applyDebouncedQuery(): void {
            if (!state.input) return;
            mutateResults(state.input.value);
        }

        // Unit 6a instrumentation: same shape as the
        // flow-save debouncer so both sites can be
        // measured together.
        let scheduleCount = 0;
        let burstStart = 0;
        state.input?.addEventListener('input', () => {
            if (state.debounceTimeoutId) {
                clearTimeout(
                    state.debounceTimeoutId,
                );
            } else {
                scheduleCount = 0;
                burstStart = performance.now();
            }
            scheduleCount += 1;
            const startedAt = burstStart;
            const count = scheduleCount;
            state.debounceTimeoutId = setTimeout(
                () => {
                    const burstDurMs =
                        performance.now() - startedAt;
                    const ratePerSec =
                        burstDurMs > 0
                            ? count / (burstDurMs / 1000)
                            : 0;
                    const callStart =
                        performance.now();
                    applyDebouncedQuery();
                    const callDurMs =
                        performance.now() - callStart;
                    log.info(
                        'palette debouncer fire',
                        'debouncer',
                        {
                            delayMs: DEBOUNCE_MS,
                            burstSchedules: count,
                            burstDurMs:
                                Math.round(burstDurMs),
                            keystrokesPerSec:
                                Math.round(
                                    ratePerSec * 10,
                                ) / 10,
                            callDurMs:
                                Math.round(
                                    callDurMs * 100,
                                ) / 100,
                        },
                    );
                },
                DEBOUNCE_MS,
            );
        });

        state.dialog.querySelector(
            '#command-palette-close',
        )?.addEventListener(
            'click',
            close,
        );

        state.dialog.addEventListener(
            'keydown',
            (e: KeyboardEvent) => {
                if (
                    e.key === 'Escape'
                ) {
                    e.preventDefault();
                    close();
                    return;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveActiveIndex(1);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveActiveIndex(-1);
                    return;
                }
                if (
                    e.key === 'Enter'
                ) {
                    e.preventDefault();
                    navigateToItem(
                        state
                            .activeIndex,
                    );
                    return;
                }
            },
        );

        state.list?.addEventListener(
            'mousemove',
            (e: Event) => {
                if (
                    !(e.target
                        instanceof
                        Element)
                ) return;
                const target =
                    e.target
                        .closest<
                            HTMLElement
                        >(
                            '.command-palette-item',
                        );
                if (target) {
                    const hoveredId =
                        target
                            .getAttribute(
                                'data-item-id',
                            );
                    const hoveredIndex =
                        state
                            .filteredItems
                            .findIndex(
                                item =>
                                    item.id
                                    === hoveredId,
                            );
                    if (
                        hoveredIndex >= 0
                        && hoveredIndex
                            !== state
                                .activeIndex
                    ) {
                        state
                            .activeIndex =
                            hoveredIndex;
                        mutateActiveItem();
                    }
                }
            },
        );

        state.list?.addEventListener(
            'click',
            (e: Event) => {
                if (
                    !(e.target
                        instanceof
                        Element)
                ) return;
                const target =
                    e.target
                        .closest<
                            HTMLElement
                        >(
                            '.command-palette-item',
                        );
                if (target) {
                    const clickedId =
                        target
                            .getAttribute(
                                'data-item-id',
                            );
                    const clickedIndex =
                        state
                            .filteredItems
                            .findIndex(
                                item =>
                                    item.id
                                    === clickedId,
                            );
                    if (
                        clickedIndex >= 0
                    )
                        navigateToItem(
                            clickedIndex,
                        );
                }
            },
        );

        document.body.appendChild(
            state.backdrop,
        );
        document.body.appendChild(
            state.dialog,
        );
    }

    document.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (isCommandPaletteHotkey(e)) {
                e.preventDefault();
                if (state.isOpen)
                    close();
                else open();
            }
        },
    );

    const searchInput = $(
        '#search-input', document,
    );
    searchInput?.addEventListener(
        'focus',
        (e) => {
            e.preventDefault();
            searchInput.blur();
            open();
        },
    );

    const mobileSearchToggle = $(
        '#mobile-search-toggle', document,
    );
    if (mobileSearchToggle) {
        mobileSearchToggle.addEventListener(
            'click',
            (e) => {
                e.preventDefault();
                e.stopPropagation();
                open();
            },
        );
    }

    // Eager-load the search index so the
    // first Cmd+K opens instantly. Without
    // this, the user pays a 100-300 ms
    // adapter-fetch latency on first open.
    void (async () => {
        const adapter = getDbAdapter();
        if (await adapter.hasSchema()) {
            getSearchIndex().catch(
                err => log.warn(
                    'eager search index load failed',
                    'palette',
                    err,
                ),
            );
            return;
        }
        const unsub = subscribeSchemaChanges(
            () => {
                unsub();
                getSearchIndex().catch(
                    err => log.warn(
                        'eager search index load failed',
                        'palette',
                        err,
                    ),
                );
            },
        );
    })();
}
