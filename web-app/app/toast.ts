const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 6000;
// Removal is event-driven — the fade itself rings the
// bell — so no duration is duplicated here. This bound
// exists ONLY for a fade that can never finish (e.g. an
// undisplayed container, or CSS not yet loaded); it sits
// far above any fade duration so it never clips one.
// Under prefers-reduced-motion the universal reset clamps
// the transition to 0.01ms and transitionend still fires.
const TOAST_REMOVAL_FALLBACK_MS = 2000;
const TOAST_CONTAINER_ID = 'toast-container';

// The closer owns the closing fact in closure state —
// the class on the element is presentation, not the
// record of whether closing has begun.
function makeToastCloser(
    toast: HTMLElement,
): () => void {
    let closing = false;
    return (): void => {
        if (closing) return;
        closing = true;
        toast.classList.add('toast--closing');
        const removeOnce = (): void => toast.remove();
        toast.addEventListener(
            'transitionend', removeOnce, { once: true },
        );
        toast.addEventListener(
            'transitioncancel', removeOnce, { once: true },
        );
        setTimeout(
            removeOnce,
            TOAST_REMOVAL_FALLBACK_MS,
        );
    };
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

    const closeToast = makeToastCloser(toast);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeToast);
    toast.appendChild(closeBtn);

    container.prepend(toast);
    setTimeout(closeToast, TOAST_DURATION_MS);
}
