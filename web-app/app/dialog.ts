import {
    $required, FOCUSABLE_SELECTOR,
} from './dom';

const focusStack: HTMLElement[] = [];
const openDialogIds: string[] = [];

function handleEscape(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Escape') return;
    const topId =
        openDialogIds.at(-1);
    if (!topId) return;
    e.preventDefault();
    e.stopPropagation();
    const cancelBtn =
        document.getElementById(
            `${topId}-cancel`,
        );
    if (cancelBtn) {
        cancelBtn.click();
    } else {
        closeDialog(topId);
    }
}

function openDialog(
    dialogId: string,
): void {
    if (
        document.activeElement
            instanceof HTMLElement
    ) {
        focusStack.push(
            document.activeElement,
        );
    }
    $required(
        `#${dialogId}-backdrop`,
        document,
    ).classList.remove('hidden');
    const dialog = $required(
        `#${dialogId}-dialog`,
        document,
    );
    dialog.classList.remove('hidden');
    dialog.setAttribute(
        'aria-hidden', 'false',
    );
    openDialogIds.push(dialogId);
    if (openDialogIds.length === 1) {
        document.addEventListener(
            'keydown',
            handleEscape,
            true,
        );
    }
    const focusable =
        dialog.querySelector<HTMLElement>(
            FOCUSABLE_SELECTOR,
        );
    focusable?.focus();
}

function closeDialog(
    dialogId: string,
): void {
    $required(
        `#${dialogId}-backdrop`,
        document,
    ).classList.add('hidden');
    const dialog = $required(
        `#${dialogId}-dialog`,
        document,
    );
    dialog.classList.add('hidden');
    dialog.setAttribute(
        'aria-hidden', 'true',
    );
    const idx =
        openDialogIds.indexOf(dialogId);
    if (idx >= 0) {
        openDialogIds.splice(idx, 1);
    }
    if (openDialogIds.length === 0) {
        document.removeEventListener(
            'keydown',
            handleEscape,
            true,
        );
    }
    focusStack.pop()?.focus();
}

function initTabs(
    tabSelector: string,
    panelSelector: string,
    activeClass: string,
): void {
    const tabs = Array.from(
        document.querySelectorAll<HTMLElement>(
            tabSelector,
        ),
    );
    const panels = Array.from(
        document.querySelectorAll<HTMLElement>(
            panelSelector,
        ),
    );

    tabs.forEach(tab => {
        const tabId = tab.dataset.tab;
        if (!tabId) return;
        const panel = document.getElementById(`tab-${tabId}`);
        const tabButtonId = `tab-btn-${tabId}`;
        const panelId = `tab-${tabId}`;

        tab.setAttribute('role', 'tab');
        tab.id = tabButtonId;
        tab.setAttribute('aria-controls', panelId);
        const isActive = tab.classList.contains(activeClass);
        tab.setAttribute('aria-selected', String(isActive));
        tab.setAttribute('tabindex', isActive ? '0' : '-1');

        if (panel) {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tabButtonId);
        }
    });

    const tablistParent = tabs[0]?.parentElement;
    if (tablistParent) tablistParent.setAttribute('role', 'tablist');

    function activateTab(tab: HTMLElement): void {
        const tabId = tab.dataset.tab;
        if (!tabId) return;
        tabs.forEach(otherTab => {
            otherTab.classList.remove(activeClass);
            otherTab.setAttribute('aria-selected', 'false');
            otherTab.setAttribute('tabindex', '-1');
        });
        tab.classList.add(activeClass);
        tab.setAttribute('aria-selected', 'true');
        tab.setAttribute('tabindex', '0');
        tab.focus();
        panels.forEach(panel => { panel.style.display = 'none'; });
        const panel = document.getElementById(`tab-${tabId}`);
        if (panel) panel.style.display = '';
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab));
        tab.addEventListener('keydown', (e) => {
            const currentIndex = tabs.indexOf(tab);
            let targetIndex = -1;
            if (e.key === 'ArrowRight')
                targetIndex =
                    (currentIndex + 1) % tabs.length;
            else if (e.key === 'ArrowLeft')
                targetIndex =
                    (currentIndex - 1 + tabs.length)
                    % tabs.length;
            else if (e.key === 'Home') targetIndex = 0;
            else if (e.key === 'End') targetIndex = tabs.length - 1;
            if (targetIndex >= 0) {
                e.preventDefault();
                activateTab(tabs[targetIndex]!);
            }
        });
    });
}

function initDialog(
    dialogId: string,
    openBtnId: string,
    onSubmit?: () => void,
): void {
    const cancelId =
        `${dialogId}-cancel`;

    $required(
        `#${openBtnId}`, document,
    ).addEventListener(
        'click',
        () => openDialog(dialogId),
    );
    $required(
        `#${cancelId}`, document,
    ).addEventListener(
        'click',
        () => closeDialog(dialogId),
    );
    $required(
        `#${dialogId}-backdrop`,
        document,
    ).addEventListener(
        'click',
        (e) => {
            if (
                e.target
                === e.currentTarget
            ) {
                closeDialog(dialogId);
            }
        },
    );
    if (onSubmit) {
        $required(
            `#${dialogId}-submit`,
            document,
        ).addEventListener(
            'click',
            onSubmit,
        );
    }
}

export {
    openDialog,
    closeDialog,
    initDialog,
    initTabs,
};
