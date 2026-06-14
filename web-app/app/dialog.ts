import {
    $$, $required,
} from './dom.ts';

const DIALOG_SUFFIX = '-dialog';
const TAB_PANEL_PREFIX = 'tab-';
const TAB_BUTTON_PREFIX = 'tab-btn-';

// The dialog seam: every modal is a native <dialog>. showModal()
// brings the top-layer focus trap, the ::backdrop, and Escape (the
// cancel event), so this module owns only opening, closing, and
// light dismiss. Validate the platform contract at this edge: the
// '#{id}-dialog' element must be a <dialog>.
function dialogElement(
    dialogId: string,
): HTMLDialogElement {
    const el = $required(
        '#' + dialogId + DIALOG_SUFFIX,
        document,
    );
    if (!(el instanceof HTMLDialogElement)) {
        throw new Error(
            'Not a <dialog>: '
            + dialogId + DIALOG_SUFFIX,
        );
    }
    return el;
}

function openDialog(dialogId: string): void {
    dialogElement(dialogId).showModal();
}

function closeDialog(dialogId: string): void {
    dialogElement(dialogId).close();
}

function initTabs(
    tabSelector: string,
    panelSelector: string,
    activeClass: string,
): void {
    const tabs = $$(tabSelector, document);
    const panels = $$(panelSelector, document);

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

// A native <dialog> reports a click on its ::backdrop as a click
// targeting the dialog element itself. Distinguish a true backdrop
// click — outside the dialog's box — from a click on the padding
// around the content, which must NOT dismiss.
function clickedOutside(
    dialog: HTMLElement,
    e: MouseEvent,
): boolean {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left
        || e.clientX > r.right
        || e.clientY < r.top
        || e.clientY > r.bottom;
}

// A click's dialog intent, or null when the target is not a
// dialog control. Pure: reads the target's data attributes and
// returns what to do; the caller drives openDialog/closeDialog.
// The identical predicate the idea and project detail pages
// otherwise hand-roll.
export type DialogIntent =
    | { readonly kind: 'open'; readonly id: string }
    | { readonly kind: 'close'; readonly id: string };

export function parseDialogClick(
    target: Element,
): DialogIntent | null {
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

// Drive a click to its dialog outcome: a backdrop click closes
// the dialog it targets; a data-dialog-open / data-dialog-cancel
// control opens or closes by id. Returns true when the click was
// a dialog control, so a page handler stops before its own
// action dispatch. The single delegated path every page routes
// dialog clicks through — one voice for open, cancel, and light
// dismiss.
export function handleDialogClick(
    target: Element,
    e: MouseEvent,
): boolean {
    if (
        target instanceof HTMLDialogElement
        && clickedOutside(target, e)
    ) {
        target.close();
        return true;
    }
    const intent = parseDialogClick(target);
    if (!intent) return false;
    if (intent.kind === 'open') {
        openDialog(intent.id);
    } else {
        closeDialog(intent.id);
    }
    return true;
}

export {
    openDialog,
    closeDialog,
    clickedOutside,
    initTabs,
};
