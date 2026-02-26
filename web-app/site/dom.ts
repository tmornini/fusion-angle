// ============================================
// FUSION AI — DOM Helpers
// Query selectors and HTML escaping.
// ============================================

export function $(selector: string, parent: ParentNode = document): HTMLElement | null {
  return parent.querySelector(selector);
}

export function $$(selector: string, parent: ParentNode = document): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector));
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
