// ============================================
// FUSION AI — Toast Notifications
// Auto-dismiss toast messages.
// ============================================

const MAX_TOASTS = 5;

function dismissToast(toast: HTMLElement): void {
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 300ms ease';
  setTimeout(() => toast.remove(), 300);
}

export function showToast(message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Enforce max visible toasts — remove oldest when exceeded
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
  closeBtn.addEventListener('click', () => dismissToast(toast));
  toast.appendChild(closeBtn);

  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), 3000);
}
