// ============================================
// FUSION AI — DOM Helpers
// Query selectors, typed element selectors,
// and HTML escaping.
// ============================================

import type { SafeHtml } from './safe-html';
import { setHtml } from './safe-html';

export function $(selector: string, parent: ParentNode = document): HTMLElement | null {
  return parent.querySelector(selector);
}

export function $$(selector: string, parent: ParentNode = document): HTMLElement[] {
  return Array.from(parent.querySelectorAll(selector));
}

// ── Typed element selectors ─────────────────
// Eliminates unsafe `as HTMLInputElement` casts at call sites.

export function $input(selector: string, parent: ParentNode = document): HTMLInputElement | null {
  return parent.querySelector<HTMLInputElement>(selector);
}

export function $select(selector: string, parent: ParentNode = document): HTMLSelectElement | null {
  return parent.querySelector<HTMLSelectElement>(selector);
}

export function $textarea(selector: string, parent: ParentNode = document): HTMLTextAreaElement | null {
  return parent.querySelector<HTMLTextAreaElement>(selector);
}

// ── Safe getAttribute ───────────────────────
// Returns '' instead of null, eliminating getAttribute()! patterns.

export function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

// ── Batch icon population ───────────────────
// Eliminates repetitive if-check-then-setHtml boilerplate.

export function populateIcons(entries: Array<[string, SafeHtml]>): void {
  for (const [selector, icon] of entries) {
    const el = $(selector);
    if (el) setHtml(el, icon);
  }
}

// ── Active class toggle on button groups ────
// Eliminates view toggle duplication across list pages.

export function initToggleGroup(
  selector: string,
  attrName: string,
  onChange: (value: string) => void,
): void {
  const buttons = $$(selector);
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute(attrName) ?? '';
      for (const b of buttons) b.classList.toggle('active', b === btn);
      onChange(value);
    });
  }
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
