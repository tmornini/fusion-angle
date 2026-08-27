import {
    STORAGE_KEY_PENDING_TOAST,
} from './storage-keys.ts';

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

type ToastVariant =
    | 'success'
    | 'error'
    | 'warning'
    | 'info';

const TOAST_VARIANTS: ReadonlySet<string> = new Set([
    'success', 'error', 'warning', 'info',
]);

function sessionStore(): Storage | null {
    if (typeof sessionStorage === 'undefined') {
        return null;
    }
    return sessionStorage;
}

function isToastVariant(
    v: string,
): v is ToastVariant {
    return TOAST_VARIANTS.has(v);
}

function persistPending(
    message: string,
    variant: ToastVariant,
): void {
    const store = sessionStore();
    if (store === null) return;
    const payload = JSON.stringify({
        message,
        variant,
        at: new Date().toISOString()
            .replace(/Z$/, '000Z'),
    });
    try {
        store.setItem(
            STORAGE_KEY_PENDING_TOAST, payload,
        );
    } catch {
        // Quota: the live toast still shows; the
        // next page simply will not replay.
    }
}

function clearPending(): void {
    sessionStore()?.removeItem(
        STORAGE_KEY_PENDING_TOAST,
    );
}

// The closer owns the closing fact in closure state —
// the class on the element is presentation, not the
// record of whether closing has begun.
function makeToastCloser(
    toast: HTMLElement,
): () => void {
    let closing = false;
    return (): void => {
        clearPending();
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

function paintToast(
    message: string,
    variant: ToastVariant,
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

export function showToast(
    message: string,
    variant: ToastVariant,
): void {
    persistPending(message, variant);
    paintToast(message, variant);
}

export function replayPendingToast(): void {
    const store = sessionStore();
    if (store === null) return;
    const raw = store.getItem(
        STORAGE_KEY_PENDING_TOAST,
    );
    if (raw === null) return;
    store.removeItem(STORAGE_KEY_PENDING_TOAST);
    const parsed: unknown = JSON.parse(raw);
    if (
        parsed === null
        || typeof parsed !== 'object'
        || !('message' in parsed)
        || !('variant' in parsed)
        || typeof parsed.message !== 'string'
        || typeof parsed.variant !== 'string'
        || !isToastVariant(parsed.variant)
    ) {
        throw new Error(
            'corrupt pending toast',
        );
    }
    paintToast(parsed.message, parsed.variant);
}
