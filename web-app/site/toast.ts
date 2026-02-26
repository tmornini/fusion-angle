// ============================================
// FUSION AI — Toast Notifications
// Auto-dismiss toast messages.
// ============================================

export function showToast(message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
