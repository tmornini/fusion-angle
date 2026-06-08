import {
    $required, FOCUSABLE_SELECTOR,
} from './dom.ts';

const BACKDROP_SUFFIX = '-backdrop';
const DIALOG_SUFFIX = '-dialog';
const CANCEL_SUFFIX = '-cancel';
const SUBMIT_SUFFIX = '-submit';
const TAB_PANEL_PREFIX = 'tab-';
const TAB_BUTTON_PREFIX = 'tab-btn-';

class DialogStack {
    readonly #focus: HTMLElement[] = [];
    #ids: string[] = [];

    topId(): string | undefined {
        return this.#ids.at(-1);
    }

    isEmpty(): boolean {
        return this.#ids.length === 0;
    }

    hasSingle(): boolean {
        return this.#ids.length === 1;
    }

    pushFocus(el: HTMLElement): void {
        this.#focus.push(el);
    }

    popFocus(): HTMLElement | undefined {
        return this.#focus.pop();
    }

    pushId(id: string): void {
        this.#ids = [...this.#ids, id];
    }

    removeId(id: string): void {
        this.#ids = this.#ids.filter(
            existing => existing !== id,
        );
    }
}

const stack = new DialogStack();

function handleEscape(
    e: KeyboardEvent,
): void {
    if (e.key !== 'Escape') return;
    const topId = stack.topId();
    if (!topId) return;
    e.preventDefault();
    e.stopPropagation();
    const cancelBtn =
        document.getElementById(
            topId + CANCEL_SUFFIX,
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
        stack.pushFocus(
            document.activeElement,
        );
    }
    $required(
        '#' + dialogId + BACKDROP_SUFFIX,
        document,
    ).classList.remove('hidden');
    const dialog = $required(
        '#' + dialogId + DIALOG_SUFFIX,
        document,
    );
    dialog.classList.remove('hidden');
    dialog.setAttribute(
        'aria-hidden', 'false',
    );
    stack.pushId(dialogId);
    if (stack.hasSingle()) {
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
        '#' + dialogId + BACKDROP_SUFFIX,
        document,
    ).classList.add('hidden');
    const dialog = $required(
        '#' + dialogId + DIALOG_SUFFIX,
        document,
    );
    dialog.classList.add('hidden');
    dialog.setAttribute(
        'aria-hidden', 'true',
    );
    stack.removeId(dialogId);
    if (stack.isEmpty()) {
        document.removeEventListener(
            'keydown',
            handleEscape,
            true,
        );
    }
    stack.popFocus()?.focus();
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
        const panel = document.getElementById(
            TAB_PANEL_PREFIX + tabId,
        );
        const tabButtonId =
            TAB_BUTTON_PREFIX + tabId;
        const panelId =
            TAB_PANEL_PREFIX + tabId;

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
        panels.forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(
            TAB_PANEL_PREFIX + tabId,
        );
        if (panel) panel.classList.remove('hidden');
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
        dialogId + CANCEL_SUFFIX;

    $required(
        '#' + openBtnId, document,
    ).addEventListener(
        'click',
        () => openDialog(dialogId),
    );
    $required(
        '#' + cancelId, document,
    ).addEventListener(
        'click',
        () => closeDialog(dialogId),
    );
    $required(
        '#' + dialogId + BACKDROP_SUFFIX,
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
            '#' + dialogId + SUBMIT_SUFFIX,
            document,
        ).addEventListener(
            'click',
            onSubmit,
        );
    }
}

// A click's dialog intent, or null when the target is not a
// dialog control. Pure: reads the target's dialog data
// attributes and returns what to do; the caller drives
// openDialog/closeDialog. The identical predicate the idea and
// project detail pages otherwise hand-roll.
export type DialogIntent =
    | { readonly kind: 'open'; readonly id: string }
    | { readonly kind: 'close'; readonly id: string };

export function parseDialogClick(
    target: Element,
): DialogIntent | null {
    if (target.classList.contains('dialog-backdrop')) {
        const id = target.getAttribute('data-dialog-id');
        return id ? { kind: 'close', id } : null;
    }
    const openEl = target.closest('[data-dialog-open]');
    if (openEl) {
        const id = openEl.getAttribute('data-dialog-open');
        return id ? { kind: 'open', id } : null;
    }
    const cancelEl = target.closest('[data-dialog-cancel]');
    if (cancelEl) {
        const id = cancelEl.getAttribute(
            'data-dialog-cancel',
        );
        return id ? { kind: 'close', id } : null;
    }
    return null;
}

export {
    openDialog,
    closeDialog,
    initDialog,
    initTabs,
};
