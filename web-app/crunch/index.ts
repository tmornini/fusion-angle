import {
    $, $$, $textarea,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { navigateTo } from '../app/core';
import {
    buildErrorState,
} from '../app/loading-states';
import {
    getCrunchColumns,
    type CrunchColumn,
} from '../app/adapters';
import {
    CrunchPresenter,
} from '../app/presenters';

function readColumns(
    presenter: CrunchPresenter,
): CrunchColumn[] {
    const columns = [
        ...presenter.currentColumns(),
    ];
    document.querySelectorAll<
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
    >(
        '[data-column-id]'
        + '[data-field-name]',
    ).forEach(el => {
        const columnId =
            el.getAttribute(
                'data-column-id',
            );
        const field =
            el.getAttribute(
                'data-field-name',
            );
        const column =
            columns.find(
                candidate =>
                    candidate.id
                        === columnId,
            );
        if (column && field) {
            const columnKey =
                field as
                    keyof CrunchColumn;
            if (
                columnKey
                    === 'friendlyName'
                || columnKey
                    === 'description'
                || columnKey
                    === 'dataType'
                || columnKey
                    === 'acronymExpansion'
            ) {
                column[columnKey] =
                    el.value;
            } else if (
                columnKey === 'isAcronym'
            ) {
                column[columnKey] =
                    el.value === 'true';
            }
        }
    });
    return columns;
}

function readContext(): string {
    const contextField =
        $textarea(
            '#crunch-context', document,
        );
    return contextField?.value ?? '';
}

function syncPresenter(
    presenter: CrunchPresenter,
): void {
    presenter.syncFields(
        readColumns(presenter),
        readContext(),
    );
}

function mutateCrunchPage(
    presenter: CrunchPresenter,
): void {
    const root =
        $(
            '#crunch-content',
            document,
        );
    if (!root) return;
    setHtml(
        root,
        presenter.buildPage(),
    );
    bindCrunchEvents(presenter);
}

function bindCrunchEvents(
    presenter: CrunchPresenter,
): void {
    if (presenter.isUploadStep()) {
        const dropzone =
            $(
                '#crunch-dropzone',
                document,
            );
        dropzone?.addEventListener(
            'click',
            () => {
                presenter
                    .simulateUpload();
                mutateCrunchPage(
                    presenter,
                );
            },
        );
    }

    if (presenter.isLabelStep()) {
        $$(
            '[data-column-toggle]',
            document,
        ).forEach(el => {
            el.addEventListener(
                'click',
                () => {
                    syncPresenter(
                        presenter,
                    );
                    const id =
                        el.getAttribute(
                            'data-column'
                            + '-toggle',
                        );
                    if (id) {
                        presenter
                            .toggleColumn(id);
                    }
                    mutateCrunchPage(
                        presenter,
                    );
                },
            );
        });

        $$(
            '[data-column-id]'
            + '[data-field-name]',
            document,
        ).forEach(el => {
            el.addEventListener(
                'input',
                () => {
                    syncPresenter(
                        presenter,
                    );
                    const reviewBtn =
                        $(
                            '#crunch-to'
                            + '-review',
                            document,
                        );
                    if (
                        reviewBtn
                        instanceof
                        HTMLButtonElement
                    ) {
                        reviewBtn
                            .disabled =
                            presenter
                            .completionPercent()
                            < 100;
                    }
                },
            );
        });

        $(
            '#crunch-back-upload',
            document,
        )?.addEventListener(
            'click',
            () => {
                presenter.goToUpload();
                mutateCrunchPage(
                    presenter,
                );
            },
        );
        $(
            '#crunch-to-review',
            document,
        )?.addEventListener(
            'click',
            () => {
                syncPresenter(presenter);
                presenter.goToReview();
                mutateCrunchPage(
                    presenter,
                );
            },
        );
    }

    if (presenter.isReviewStep()) {
        $(
            '#crunch-edit-labels',
            document,
        )?.addEventListener(
            'click',
            () => {
                presenter.goToLabel();
                mutateCrunchPage(
                    presenter,
                );
            },
        );
        $(
            '#crunch-to-dashboard',
            document,
        )?.addEventListener(
            'click',
            () => navigateTo(
                'dashboard',
            ),
        );
    }
}

export async function init(
): Promise<void> {
    const container =
        $('#crunch-content', document);
    if (!container) return;

    const presenter =
        new CrunchPresenter();

    try {
        const mockColumns =
            await getCrunchColumns();
        presenter.loadMockData(
            mockColumns,
        );
        mutateCrunchPage(presenter);
    } catch {
        setHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' Crunch data.',
                'Try Again',
            ),
        );
        container
            .querySelector(
                '[data-retry-btn]',
            )
            ?.addEventListener(
                'click',
                () => init(),
            );
    }
}
