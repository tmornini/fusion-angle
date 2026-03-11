import { $ } from './dom';

const focusStack: HTMLElement[] = [];

function openDialog(dialogId: string): void {
  if (document.activeElement instanceof HTMLElement) {
    focusStack.push(document.activeElement);
  }
  $(`#${dialogId}-backdrop`)?.classList.remove('hidden');
  const dialog = $(`#${dialogId}-dialog`);
  dialog?.classList.remove('hidden');
  dialog?.setAttribute('aria-hidden', 'false');
  const focusable = dialog?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  focusable?.focus();
}

function closeDialog(dialogId: string): void {
  $(`#${dialogId}-backdrop`)?.classList.add('hidden');
  const dialog = $(`#${dialogId}-dialog`);
  dialog?.classList.add('hidden');
  dialog?.setAttribute('aria-hidden', 'true');
  focusStack.pop()?.focus();
}

function initTabs(tabSelector: string, panelSelector: string, activeClass = 'active'): void {
  const tabs = Array.from(document.querySelectorAll<HTMLElement>(tabSelector));
  const panels = Array.from(document.querySelectorAll<HTMLElement>(panelSelector));

  // Set up ARIA roles and attributes
  tabs.forEach(tab => {
    const tabId = tab.dataset.tab ?? '';
    const panel = document.getElementById(`tab-${tabId}`);
    const tabButtonId = `tab-btn-${tabId}`;
    const panelId = `tab-${tabId}`;

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

  // Set tablist role on parent
  const tablistParent = tabs[0]?.parentElement;
  if (tablistParent) tablistParent.setAttribute('role', 'tablist');

  function activateTab(tab: HTMLElement): void {
    const tabId = tab.dataset.tab ?? '';
    tabs.forEach(otherTab => {
      otherTab.classList.remove(activeClass);
      otherTab.setAttribute('aria-selected', 'false');
      otherTab.setAttribute('tabindex', '-1');
    });
    tab.classList.add(activeClass);
    tab.setAttribute('aria-selected', 'true');
    tab.setAttribute('tabindex', '0');
    tab.focus();
    panels.forEach(panel => { panel.style.display = 'none'; });
    const panel = document.getElementById(`tab-${tabId}`);
    if (panel) panel.style.display = '';
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (e) => {
      const currentIndex = tabs.indexOf(tab);
      let targetIndex = -1;
      if (e.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') targetIndex = 0;
      else if (e.key === 'End') targetIndex = tabs.length - 1;
      if (targetIndex >= 0) {
        e.preventDefault();
        activateTab(tabs[targetIndex]!);
      }
    });
  });
}

export { openDialog, closeDialog, initTabs };
