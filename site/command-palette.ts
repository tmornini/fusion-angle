// ============================================
// FUSION AI — Command Palette (Cmd+K)
// Self-contained module: search, keyboard nav, rendering
// ============================================

import {
  escapeHtml,
  iconSearch, iconLightbulb, iconFolderKanban, iconUser, iconHome,
  iconTarget, iconDatabase, iconGitBranch, iconSettings, iconUsers,
  iconActivity, iconBell, iconBarChart, iconBrain, iconPalette,
  iconClipboardCheck, iconFileText, iconX,
} from './script';
import { getIdeas, getProjects, getTeamMembers } from './data';

// ── Types ────────────────────────────────

interface SearchItem {
  id: string;
  title: string;
  meta: string;
  category: 'ideas' | 'projects' | 'people' | 'pages';
  icon: string;
  href: string;
  keywords: string;
}

interface PageEntry {
  title: string;
  icon: string;
  href: string;
  keywords: string;
}

// ── Page registry ────────────────────────

const pages: PageEntry[] = [
  { title: 'Dashboard', icon: iconHome(16), href: '../dashboard/index.html', keywords: 'home overview' },
  { title: 'Ideas', icon: iconLightbulb(16), href: '../ideas/index.html', keywords: 'ideas list innovation' },
  { title: 'Create Idea', icon: iconLightbulb(16), href: '../idea-create/index.html', keywords: 'new idea submit' },
  { title: 'Review Queue', icon: iconClipboardCheck(16), href: '../idea-review-queue/index.html', keywords: 'review approve reject' },
  { title: 'Projects', icon: iconFolderKanban(16), href: '../projects/index.html', keywords: 'projects list kanban' },
  { title: 'Edge List', icon: iconTarget(16), href: '../edge-list/index.html', keywords: 'edge outcomes metrics' },
  { title: 'Crunch', icon: iconDatabase(16), href: '../crunch/index.html', keywords: 'data labeling columns' },
  { title: 'Flow', icon: iconGitBranch(16), href: '../flow/index.html', keywords: 'process workflow steps' },
  { title: 'Team', icon: iconUsers(16), href: '../team/index.html', keywords: 'team members roster' },
  { title: 'Account', icon: iconSettings(16), href: '../account/index.html', keywords: 'account billing plan' },
  { title: 'Profile', icon: iconUser(16), href: '../profile/index.html', keywords: 'profile settings personal' },
  { title: 'Company Settings', icon: iconSettings(16), href: '../company-settings/index.html', keywords: 'company organization settings' },
  { title: 'Manage Users', icon: iconUsers(16), href: '../manage-users/index.html', keywords: 'users invite admin' },
  { title: 'Activity Feed', icon: iconActivity(16), href: '../activity-feed/index.html', keywords: 'activity feed log' },
  { title: 'Notifications', icon: iconBell(16), href: '../notification-settings/index.html', keywords: 'notification preferences alerts' },
  { title: 'Design System', icon: iconPalette(16), href: '../design-system/index.html', keywords: 'components ui reference' },
];

// ── State ────────────────────────────────

let isOpen = false;
let activeIndex = 0;
let allItems: SearchItem[] = [];
let filteredItems: SearchItem[] = [];
let dataLoaded = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// ── DOM refs ─────────────────────────────

let backdrop: HTMLElement | null = null;
let dialog: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let list: HTMLElement | null = null;
let liveRegion: HTMLElement | null = null;
let previousFocus: HTMLElement | null = null;

// ── Data loading ─────────────────────────

async function loadData(): Promise<void> {
  if (dataLoaded) return;
  dataLoaded = true;

  // Start with pages immediately
  allItems = pages.map((p, i) => ({
    id: `page-${i}`,
    title: p.title,
    meta: 'Page',
    category: 'pages' as const,
    icon: p.icon,
    href: p.href,
    keywords: p.keywords,
  }));

  // Load dynamic data
  try {
    const [ideas, projects, members] = await Promise.all([
      getIdeas(),
      getProjects(),
      getTeamMembers(),
    ]);

    const ideaItems: SearchItem[] = ideas.map(i => ({
      id: `idea-${i.id}`,
      title: i.title,
      meta: `Score: ${i.score} · ${i.status.replace(/_/g, ' ')}`,
      category: 'ideas',
      icon: iconLightbulb(16),
      href: `../idea-scoring/index.html?ideaId=${i.id}`,
      keywords: `${i.submittedBy} ${i.status}`,
    }));

    const projectItems: SearchItem[] = projects.map(p => ({
      id: `project-${p.id}`,
      title: p.title,
      meta: `Progress: ${p.progress}% · ${p.status.replace(/_/g, ' ')}`,
      category: 'projects',
      icon: iconFolderKanban(16),
      href: `../project-detail/index.html?projectId=${p.id}`,
      keywords: `${p.status}`,
    }));

    const peopleItems: SearchItem[] = members.map(m => ({
      id: `person-${m.id}`,
      title: m.name,
      meta: `${m.role} · ${m.department}`,
      category: 'people',
      icon: iconUser(16),
      href: `../team/index.html`,
      keywords: `${m.role} ${m.department} ${m.email}`,
    }));

    allItems = [...ideaItems, ...projectItems, ...peopleItems, ...allItems];
  } catch {
    // Pages are still available even if data loading fails
  }
}

// ── Search ───────────────────────────────

function search(query: string): SearchItem[] {
  if (!query.trim()) return allItems.slice(0, 12);
  const q = query.toLowerCase();
  return allItems.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.meta.toLowerCase().includes(q) ||
    item.keywords.toLowerCase().includes(q)
  );
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const q = escapeHtml(query);
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(re, '<mark>$1</mark>');
}

// ── Rendering ────────────────────────────

const categoryOrder: SearchItem['category'][] = ['ideas', 'projects', 'people', 'pages'];
const categoryLabels: Record<string, string> = {
  ideas: 'Ideas',
  projects: 'Projects',
  people: 'People',
  pages: 'Pages',
};

function renderResults(query: string): void {
  if (!list) return;

  filteredItems = search(query);
  activeIndex = 0;

  if (filteredItems.length === 0) {
    list.innerHTML = `<div class="cmdk-empty">No results found for "${escapeHtml(query)}"</div>`;
    if (liveRegion) liveRegion.textContent = 'No results found';
    return;
  }

  // Group by category
  const grouped: Partial<Record<SearchItem['category'], SearchItem[]>> = {};
  filteredItems.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category]!.push(item);
  });

  let html = '';
  let globalIndex = 0;
  for (const cat of categoryOrder) {
    const items = grouped[cat];
    if (!items?.length) continue;

    html += `<div class="cmdk-group-label">${categoryLabels[cat]}</div>`;
    for (const item of items) {
      html += `<div class="cmdk-item" role="option" id="cmdk-item-${globalIndex}" data-index="${globalIndex}" data-href="${item.href}" ${globalIndex === 0 ? 'aria-selected="true"' : ''}>
        <div class="cmdk-item-icon">${item.icon}</div>
        <div class="cmdk-item-content">
          <div class="cmdk-item-title">${highlightMatch(item.title, query)}</div>
          <div class="cmdk-item-meta">${escapeHtml(item.meta)}</div>
        </div>
      </div>`;
      globalIndex++;
    }
  }

  list.innerHTML = html;
  if (liveRegion) liveRegion.textContent = `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''} found`;
}

function updateActiveItem(): void {
  if (!list) return;
  list.querySelectorAll('.cmdk-item').forEach((el, i) => {
    el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
  });
  const activeEl = list.querySelector(`[data-index="${activeIndex}"]`);
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  if (input) input.setAttribute('aria-activedescendant', `cmdk-item-${activeIndex}`);
}

// ── Navigation ───────────────────────────

function navigateToItem(index: number): void {
  const item = filteredItems[index];
  if (!item) return;
  close();
  window.location.href = item.href;
}

// ── Open / Close ─────────────────────────

function open(): void {
  if (isOpen) return;
  isOpen = true;
  previousFocus = document.activeElement as HTMLElement;

  if (!backdrop) injectDOM();
  backdrop!.classList.remove('hidden');
  dialog!.classList.remove('hidden');
  input!.value = '';
  input!.focus();

  loadData().then(() => renderResults(''));
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
  backdrop?.classList.add('hidden');
  dialog?.classList.add('hidden');
  if (previousFocus) previousFocus.focus();
}

// ── DOM injection ────────────────────────

function injectDOM(): void {
  backdrop = document.createElement('div');
  backdrop.className = 'cmdk-backdrop hidden';
  backdrop.addEventListener('click', close);

  dialog = document.createElement('div');
  dialog.className = 'cmdk-dialog hidden';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Search');

  dialog.innerHTML = `
    <div class="cmdk-input-wrapper">
      ${iconSearch(20)}
      <input class="cmdk-input" placeholder="Search ideas, projects, people, pages..." type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-listbox" aria-autocomplete="list" />
      <button class="btn btn-ghost btn-icon btn-xs" aria-label="Close" id="cmdk-close">${iconX(16)}</button>
    </div>
    <div class="cmdk-list" id="cmdk-listbox" role="listbox" aria-label="Search results"></div>
    <div class="cmdk-footer">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span class="flex items-center gap-1"><kbd>↵</kbd> Open</span>
        <span class="flex items-center gap-1"><kbd>Esc</kbd> Close</span>
      </div>
    </div>
    <div class="cmdk-live" role="status" aria-live="polite" aria-atomic="true"></div>`;

  input = dialog.querySelector('.cmdk-input') as HTMLInputElement;
  list = dialog.querySelector('#cmdk-listbox');
  liveRegion = dialog.querySelector('.cmdk-live');

  // Input handler with debounce
  input.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderResults(input!.value);
    }, 100);
  });

  // Close button
  dialog.querySelector('#cmdk-close')?.addEventListener('click', close);

  // Keyboard nav
  dialog.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        activeIndex = (activeIndex + 1) % filteredItems.length;
        updateActiveItem();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
        updateActiveItem();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      navigateToItem(activeIndex);
      return;
    }
  });

  // Mouse hover sets active
  list!.addEventListener('mousemove', (e: Event) => {
    const target = (e.target as HTMLElement).closest('.cmdk-item') as HTMLElement | null;
    if (target) {
      const idx = parseInt(target.getAttribute('data-index') || '0', 10);
      if (idx !== activeIndex) {
        activeIndex = idx;
        updateActiveItem();
      }
    }
  });

  // Click to navigate
  list!.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest('.cmdk-item') as HTMLElement | null;
    if (target) {
      const idx = parseInt(target.getAttribute('data-index') || '0', 10);
      navigateToItem(idx);
    }
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(dialog);
}

// ── Public init ──────────────────────────

export function initCommandPalette(): void {
  // Global keyboard shortcut
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen) close(); else open();
    }
  });

  // Intercept desktop search input focus
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('focus', (e) => {
      e.preventDefault();
      (searchInput as HTMLInputElement).blur();
      open();
    });
  }

  // Intercept mobile search toggle
  const mobileSearchToggle = document.getElementById('mobile-search-toggle');
  if (mobileSearchToggle) {
    // Replace click handler
    const newToggle = mobileSearchToggle.cloneNode(true) as HTMLElement;
    mobileSearchToggle.parentNode?.replaceChild(newToggle, mobileSearchToggle);
    newToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      open();
    });
  }
}
