import {
    $, $input,
    bindEnterToClick,
} from '../app/dom';
import {
    setHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildErrorState,
} from '../app/loading-states';
import { log } from '../app/logger';
import {
    getCompanySettings,
    putCompanySettings,
} from '../app/adapters';
import {
    SettingsPresenter,
} from '../app/presenters';

export async function init(): Promise<void> {
    const container =
        $('#settings-content', document);
    if (!container) return;
    let settings: Awaited<
        ReturnType<typeof getCompanySettings>
    >;
    try {
        settings =
            await getCompanySettings();
    } catch (err) {
        log.error(
            'getCompanySettings failed',
            'settings',
            err,
        );
        setHtml(
            container,
            buildErrorState(
                'Failed to load'
                + ' company settings.',
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
        return;
    }

    const presenter =
        new SettingsPresenter(settings);
    setHtml(
        container,
        presenter.buildPage(),
    );

    $(
        '#company-settings-save-btn',
        document,
    )?.addEventListener(
        'click',
        async () => {
            const inp = (id: string) =>
                $input(
                    '#' + id, document,
                )!.value.trim();
            const p =
                'company-settings-';
            try {
                await putCompanySettings({
                    name: inp(p + 'name'),
                    domain: inp(
                        p + 'domain',
                    ),
                });
                showToast(
                    'Settings saved',
                    'success',
                );
            } catch (err) {
                log.error(
                    'putCompanySettings'
                    + ' failed',
                    'settings',
                    err,
                );
                showToast(
                    'Failed to save'
                    + ' settings',
                    'error',
                );
            }
        },
    );

    const saveSel =
        '#company-settings-save-btn';
    bindEnterToClick(
        '#company-settings-name', saveSel,
    );
    bindEnterToClick(
        '#company-settings-domain',
        saveSel,
    );
}
