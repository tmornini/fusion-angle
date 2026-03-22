import {
    $,
    $input,
    $select,
    attr,
    populateIcons,
} from '../app/dom';
import {
    html,
    setHtml,
    type SafeHtml,
} from '../app/safe-html';
import {
    buildSkeleton,
    withLoadingState,
} from '../app/loading-states';
import {
    iconGitBranch,
    iconSearch,
    iconChevronRight,
    iconListTodo,
    iconUsers,
    iconFileText,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getFlows,
    type FlowListItem,
} from '../app/adapters';

function buildFlowCard(
    flow: FlowListItem,
): SafeHtml {
    return html`
    <div class="card card-hover p-4"
        style="cursor:pointer"
        data-flow-card="${flow.id}">
        <div class="${
            'flex items-start '
            + 'justify-between gap-4'
        }">
            <div style="${
                'flex:1;min-width:0'
            }">
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-2 mb-2'
                }">
                    <span class="${
                        'badge'
                        + ' badge-outline'
                        + ' text-xs'
                    }">${
                        flow.department
                    }</span>
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${flow.name}</h3>
                <p class="${
                    'text-sm'
                    + ' text-muted mb-2'
                }">${
                    flow.description
                }</p>
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-3 '
                    + 'text-sm'
                    + ' text-muted'
                }">
                    <span class="${
                        'flex'
                        + ' items-center'
                        + ' gap-1'
                    }">${
                        iconListTodo(14, '')
                    } ${
                        flow.stepsCount
                    } ${
                        flow.stepsCount
                            === 1
                            ? 'step'
                            : 'steps'
                    }</span>
                </div>
            </div>
            <div class="${
                'flex items-center'
            }">${
                iconChevronRight(
                    20,
                    'text-muted',
                )
            }</div>
        </div>
    </div>`;
}

export async function init(): Promise<void> {
    const listEl = $('#flow-list', document);
    if (!listEl) return;

    const result = await withLoadingState(
        listEl,
        buildSkeleton('card-list', 4),
        getFlows,
        init,
        {
            icon: iconGitBranch(24, ''),
            title:
                'No Processes Documented',
            description:
                'Start documenting your'
                + ' business processes to'
                + ' improve visibility'
                + ' and consistency.',
            action: {
                label: 'View Ideas',
                href:
                    '../ideas/index.html',
            },
        },
    );
    if (!result) return;
    const flows = result;

    populateIcons([
        [
            '#page-badge',
            html`${
                iconGitBranch(14, '')
            } Process Documentation`,
        ],
        [
            '#search-field-icon',
            iconSearch(16, ''),
        ],
    ]);
    $('#page-badge', document)?.classList
        .remove('hidden');
    const totalSteps = flows.reduce(
        (sum, flow) =>
            sum + flow.stepsCount,
        0,
    );
    const departments = new Set(
        flows.map(flow => flow.department),
    );
    const statsEl = $('#flow-stats', document);
    if (statsEl) {
        const statBoxStyle = (bg: string) =>
            'p-2 rounded-lg';
        setHtml(statsEl, html`
      <div class="card p-4">
          <div class="${
              'flex items-center gap-3'
          }">
              <div
                  class="p-2 rounded-lg"
                  style="${
                      'background:'
                      + 'hsl(var('
                      + '--primary)/0.1)'
                  }"
              >${
                  iconGitBranch(
                      20,
                      'text-primary',
                  )
              }</div>
              <div>
                  <p class="${
                      'text-2xl font-bold'
                  }">${flows.length}</p>
                  <p class="${
                      'text-sm text-muted'
                  }">Total Flows</p>
              </div>
          </div>
      </div>
      <div class="card p-4">
          <div class="${
              'flex items-center gap-3'
          }">
              <div
                  class="p-2 rounded-lg"
                  style="${
                      'background:'
                      + 'hsl(var('
                      + '--success-soft))'
                  }"
              >${
                  iconFileText(
                      20,
                      'text-success',
                  )
              }</div>
              <div>
                  <p class="${
                      'text-2xl font-bold'
                  }">${totalSteps}</p>
                  <p class="${
                      'text-sm text-muted'
                  }">Total Steps</p>
              </div>
          </div>
      </div>
      <div class="card p-4">
          <div class="${
              'flex items-center gap-3'
          }">
              <div
                  class="p-2 rounded-lg"
                  style="${
                      'background:'
                      + 'hsl(var('
                      + '--warning-soft))'
                  }"
              >${
                  iconUsers(
                      20,
                      'text-warning',
                  )
              }</div>
              <div>
                  <p class="${
                      'text-2xl font-bold'
                  }">${
                      departments.size
                  }</p>
                  <p class="${
                      'text-sm text-muted'
                  }">Departments</p>
              </div>
          </div>
      </div>`);
    }

    const filterEl = $select(
        '#flow-department-filter', document,
    );
    if (filterEl) {
        for (
            const dept
                of [...departments].sort()
        ) {
            const option =
                document.createElement(
                    'option',
                );
            option.value = dept;
            option.textContent = dept;
            filterEl.appendChild(option);
        }
    }

    const emptyEl = $('#flow-empty', document);
    if (emptyEl) {
        setHtml(
            emptyEl,
            html`${
                iconGitBranch(
                    48,
                    'text-muted',
                )
            }<h3 class="${
                'text-lg font-semibold '
                + 'mt-4 mb-2'
            }">No processes found</h3>
            <p class="text-muted">${
                'Try adjusting your search'
                + ' or filter criteria'
            }</p>`,
        );
    }

    function mutateFilteredList() {
        const search =
            $input('#flow-search', document)!
                .value.toLowerCase();
        const department =
            $select(
                '#flow-department-filter',
                document,
            )!.value;
        const filtered = flows.filter(
            flow => {
                const matchesSearch =
                    flow.name
                        .toLowerCase()
                        .includes(search)
                    || flow.description
                        .toLowerCase()
                        .includes(search);
                const matchesDepartment =
                    department === 'all'
                    || flow.department
                        === department;
                return (
                    matchesSearch
                    && matchesDepartment
                );
            },
        );
        const list = $('#flow-list', document);
        const empty = $('#flow-empty', document);
        if (list) {
            setHtml(
                list,
                html`${filtered.map(
                    buildFlowCard,
                )}`,
            );
        }
        if (list) {
            list.style.display =
                filtered.length ? '' : 'none';
        }
        if (empty) {
            empty.style.display =
                filtered.length
                    ? 'none'
                    : '';
        }
    }

    listEl.addEventListener(
        'click',
        (e) => {
            if (
                !(
                    e.target
                        instanceof Element
                )
            ) {
                return;
            }
            const card =
                e.target.closest<HTMLElement>(
                    '[data-flow-card]',
                );
            if (card) {
                navigateTo('flow-detail', {
                    processId: attr(
                        card,
                        'data-flow-card',
                    ),
                });
            }
        },
    );

    $(
        '#flow-search', document,
    )?.addEventListener(
        'input',
        mutateFilteredList,
    );
    $(
        '#flow-department-filter', document,
    )?.addEventListener(
        'change',
        mutateFilteredList,
    );
    mutateFilteredList();
}
