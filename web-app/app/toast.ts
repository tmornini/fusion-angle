const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 3000;
const TOAST_TRANSITION_MS = 300;
const TOAST_CONTAINER_ID = 'toast-container';

function closeActiveToast(
    toast: HTMLElement,
): void {
    toast.style.opacity = '0';
    toast.style.transition =
        `opacity ${TOAST_TRANSITION_MS}ms ease`;
    setTimeout(
        () => toast.remove(),
        TOAST_TRANSITION_MS,
    );
}

export function showToast(
    message: string,
    variant:
        | 'success'
        | 'error'
        | 'warning'
        | 'info' = 'info',
): void {
    const container = document.getElementById(
        TOAST_CONTAINER_ID,
    );
    if (!container) return;

    while (container.children.length >= MAX_TOASTS) {
        container.firstElementChild?.remove();
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
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => closeActiveToast(toast));
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    setTimeout(
            () => closeActiveToast(toast),
            TOAST_DURATION_MS,
    );
}
