const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 6000;
// Matches the `.toast--closing` fade in components-toast.css
// (var(--duration-slow)); the class owns the visual, this owns
// the removal-after-fade timing.
const TOAST_TRANSITION_MS = 300;
const TOAST_CONTAINER_ID = 'toast-container';

function closeActiveToast(
    toast: HTMLElement,
): void {
    if (toast.classList.contains('toast--closing')) {
        return;
    }
    toast.classList.add('toast--closing');
    setTimeout(
        () => toast.remove(),
        TOAST_TRANSITION_MS,
    );
}

function ensureContainer(): HTMLElement {
    const existing = document.getElementById(
        TOAST_CONTAINER_ID,
    );
    if (existing) return existing;
    const container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
    return container;
}

export function showToast(
    message: string,
    variant:
        | 'success'
        | 'error'
        | 'warning'
        | 'info',
): void {
    const container = ensureContainer();

    while (container.children.length >= MAX_TOASTS) {
        container.lastElementChild?.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${variant}`;
    toast.setAttribute('role', 'status');

    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeActiveToast(toast));
    toast.appendChild(closeBtn);

    container.prepend(toast);
    setTimeout(
            () => closeActiveToast(toast),
            TOAST_DURATION_MS,
    );
}
