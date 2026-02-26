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
  html, setHtml, SafeHtml, trusted,
} from './script';
import { getIdeas, getProjects, getTeamMembers } from './data';

// ── Types ────────────────────────────────

interface SearchItem {
  id: string;
  title: string;
  meta: string;
  category: 'ideas' | 'projects' | 'people' | 'pages';
  icon: SafeHtml;
  href: string;
  keywords: string;
}

interface PageEntry {
  title: string;
  icon: SafeHtml;
  href: string;
  keywords: string;
}

// ── Page registry ────────────────────────

const pages: PageEntry[] = [
  { title: 'Dashboard', icon: iconHome(16), href: '../../core/dashboard/index.html', keywords: 'home overview' },
  { title: 'Ideas', icon: iconLightbulb(16), href: '../../core/ideas/index.html', keywords: 'ideas list innovation' },
  { title: 'Create Idea', icon: iconLightbulb(16), href: '../../core/idea-create/index.html', keywords: 'new idea submit' },
  { title: 'Review Queue', icon: iconClipboardCheck(16), href: '../../core/idea-review-queue/index.html', keywords: 'review approve reject' },
  { title: 'Projects', icon: iconFolderKanban(16), href: '../../core/projects/index.html', keywords: 'projects list kanban' },
  { title: 'Edge List', icon: iconTarget(16), href: '../../tools/edge-list/index.html', keywords: 'edge outcomes metrics' },
  { title: 'Crunch', icon: iconDatabase(16), href: '../../tools/crunch/index.html', keywords: 'data labeling columns' },
  { title: 'Flow', icon: iconGitBranch(16), href: '../../tools/flow/index.html', keywords: 'process workflow steps' },
  { title: 'Team', icon: iconUsers(16), href: '../../admin/team/index.html', keywords: 'team members roster' },
  { title: 'Account', icon: iconSettings(16), href: '../../admin/account/index.html', keywords: 'account billing plan' },
  { title: 'Profile', icon: iconUser(16), href: '../../admin/profile/index.html', keywords: 'profile settings personal' },
  { title: 'Company Settings', icon: iconSettings(16), href: '../../admin/company-settings/index.html', keywords: 'company organization settings' },
  { title: 'Manage Users', icon: iconUsers(16), href: '../../admin/manage-users/index.html', keywords: 'users invite admin' },
  { title: 'Activity Feed', icon: iconActivity(16), href: '../../admin/activity-feed/index.html', keywords: 'activity feed log' },
  { title: 'Notifications', icon: iconBell(16), href: '../../admin/notification-settings/index.html', keywords: 'notification preferences alerts' },
  { title: 'Design System', icon: iconPalette(16), href: '../../reference/design-system/index.html', keywords: 'components ui reference' },
];

// ── State ────────────────────────────────

let isOpen = false;
let activeIndex = 0;
let allItems: SearchItem[] = [];
let filteredItems: SearchItem[] = [];
let isDataLoaded = false;
let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;

// ── DOM refs ─────────────────────────────

let backdrop: HTMLElement | null = null;
let dialog: HTMLElement | null = null;
let input: HTMLInputElement | null = null;
let list: HTMLElement | null = null;
let liveRegion: HTMLElement | null = null;
let previousFocusElement: HTMLElement | null = null;

// ── Data loading ─────────────────────────

async function loadSearchIndex(): Promise<void> {
  if (isDataLoaded) return;
  isDataLoaded = true;

  // Start with pages immediately
  allItems = pages.map((page) => ({
    id: `page-${page.href.split('/').slice(-2, -1)[0]!}`,
    title: page.title,
    meta: 'Page',
    category: 'pages' as const,
    icon: page.icon,
    href: page.href,
    keywords: page.keywords,
  }));

  // Load dynamic data
  try {
    const [ideas, projects, members] = await Promise.all([
      getIdeas(),
      getProjects(),
      getTeamMembers(),
    ]);

    const ideaItems: SearchItem[] = ideas.map(idea => ({
      id: `idea-${idea.id}`,
      title: idea.title,
      meta: `Score: ${idea.score} · ${idea.status.replace(/_/g, ' ')}`,
      category: 'ideas',
      icon: iconLightbulb(16),
      href: `../../core/idea-convert/index.html?ideaId=${idea.id}`,
      keywords: `${idea.submittedBy} ${idea.status}`,
    }));

    const projectItems: SearchItem[] = projects.map(project => ({
      id: `project-${project.id}`,
      title: project.title,
      meta: `Progress: ${project.progress}% · ${project.status.replace(/_/g, ' ')}`,
      category: 'projects',
      icon: iconFolderKanban(16),
      href: `../../core/project-detail/index.html?projectId=${project.id}`,
      keywords: `${project.status}`,
    }));

    const peopleItems: SearchItem[] = members.map(member => ({
      id: `person-${member.id}`,
      title: member.name,
      meta: `${member.role} · ${member.department}`,
      category: 'people',
      icon: iconUser(16),
      href: `../../admin/team/index.html`,
      keywords: `${member.role} ${member.department} ${member.email}`,
    }));

    allItems = [...ideaItems, ...projectItems, ...peopleItems, ...allItems];
  } catch {
    // Pages are still available even if data loading fails
  }
}

// ── Search ───────────────────────────────

function search(query: string): SearchItem[] {
  if (!query.trim()) return allItems.slice(0, 12);
  const normalizedQuery = query.toLowerCase();
  return allItems.filter(item =>
    item.title.toLowerCase().includes(normalizedQuery) ||
    item.meta.toLowerCase().includes(normalizedQuery) ||
    item.keywords.toLowerCase().includes(normalizedQuery)
  );
}

function buildHighlightedMatch(text: string, query: string): SafeHtml {
  if (!query.trim()) return trusted(escapeHtml(text));
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const highlightPattern = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return trusted(escaped.replace(highlightPattern, '<mark>$1</mark>'));
}

// ── Rendering ────────────────────────────

const categoryOrder: SearchItem['category'][] = ['ideas', 'projects', 'people', 'pages'];
const categoryLabels: Record<string, string> = {
  ideas: 'Ideas',
  projects: 'Projects',
  people: 'People',
  pages: 'Pages',
};

function mutateResults(query: string): void {
  if (!list) return;

  filteredItems = search(query);
  activeIndex = 0;

  if (filteredItems.length === 0) {
    setHtml(list, html`<div class="command-palette-empty">No results found for "${query}"</div>`);
    if (liveRegion) liveRegion.textContent = 'No results found';
    return;
  }

  // Group by category
  const grouped: Partial<Record<SearchItem['category'], SearchItem[]>> = {};
  filteredItems.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category]!.push(item);
  });

  const markup: SafeHtml[] = [];
  let posIndex = 0;
  for (const category of categoryOrder) {
    const items = grouped[category];
    if (!items?.length) continue;

    markup.push(html`<div class="command-palette-group-label">${categoryLabels[category]}</div>`);
    for (const item of items) {
      markup.push(html`<div class="command-palette-item" role="option" id="command-palette-item-${item.id}" data-item-id="${item.id}" data-href="${item.href}" aria-posinset="${posIndex + 1}" aria-setsize="${filteredItems.length}" ${posIndex === 0 ? trusted('aria-selected="true"') : trusted('')}>
        <div class="command-palette-item-icon">${item.icon}</div>
        <div class="command-palette-item-content">
          <div class="command-palette-item-title">${buildHighlightedMatch(item.title, query)}</div>
          <div class="command-palette-item-meta">${item.meta}</div>
        </div>
      </div>`);
      posIndex++;
    }
  }

  setHtml(list, html`${markup}`);
  if (liveRegion) liveRegion.textContent = `${filteredItems.length} result${filteredItems.length !== 1 ? 's' : ''} found`;
}

function mutateActiveItem(): void {
  if (!list) return;
  list.querySelectorAll('.command-palette-item').forEach((el, i) => {
    el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
  });
  const activeItem = filteredItems[activeIndex];
  if (activeItem) {
    const activeEl = list.querySelector(`[data-item-id="${activeItem.id}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    if (input) input.setAttribute('aria-activedescendant', `command-palette-item-${activeItem.id}`);
  }
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
  previousFocusElement = document.activeElement as HTMLElement;

  if (!backdrop) initCommandPaletteDOM();
  backdrop!.classList.remove('hidden');
  dialog!.classList.remove('hidden');
  input!.value = '';
  input!.focus();

  loadSearchIndex().then(() => mutateResults(''));
}

function close(): void {
  if (!isOpen) return;
  isOpen = false;
  backdrop?.classList.add('hidden');
  dialog?.classList.add('hidden');
  if (previousFocusElement) previousFocusElement.focus();
}

// ── DOM injection ────────────────────────

function initCommandPaletteDOM(): void {
  backdrop = document.createElement('div');
  backdrop.className = 'command-palette-backdrop hidden';
  backdrop.addEventListener('click', close);

  dialog = document.createElement('div');
  dialog.className = 'command-palette-dialog hidden';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Search');

  setHtml(dialog, html`
    <div class="command-palette-input-wrapper">
      ${iconSearch(20)}
      <input class="command-palette-input" placeholder="Search ideas, projects, people, pages..." type="text" role="combobox" aria-expanded="true" aria-controls="command-palette-listbox" aria-autocomplete="list" />
      <button class="btn btn-ghost btn-icon btn-xs" aria-label="Close" id="command-palette-close">${iconX(16)}</button>
    </div>
    <div class="command-palette-list" id="command-palette-listbox" role="listbox" aria-label="Search results"></div>
    <div class="command-palette-footer">
      <div class="flex items-center gap-3">
        ${trusted('<span class="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>')}
        ${trusted('<span class="flex items-center gap-1"><kbd>↵</kbd> Open</span>')}
        ${trusted('<span class="flex items-center gap-1"><kbd>Esc</kbd> Close</span>')}
      </div>
    </div>
    <div class="command-palette-live" role="status" aria-live="polite" aria-atomic="true"></div>`);

  input = dialog.querySelector('.command-palette-input') as HTMLInputElement;
  list = dialog.querySelector('#command-palette-listbox');
  liveRegion = dialog.querySelector('.command-palette-live');

  // Input handler with debounce
  input.addEventListener('input', () => {
    if (debounceTimeoutId) clearTimeout(debounceTimeoutId);
    debounceTimeoutId = setTimeout(() => {
      mutateResults(input!.value);
    }, 100);
  });

  // Close button
  dialog.querySelector('#command-palette-close')?.addEventListener('click', close);

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
        mutateActiveItem();
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        activeIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
        mutateActiveItem();
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
    const target = (e.target as HTMLElement).closest('.command-palette-item') as HTMLElement | null;
    if (target) {
      const hoveredId = target.getAttribute('data-item-id');
      const hoveredIndex = filteredItems.findIndex(item => item.id === hoveredId);
      if (hoveredIndex >= 0 && hoveredIndex !== activeIndex) {
        activeIndex = hoveredIndex;
        mutateActiveItem();
      }
    }
  });

  // Click to navigate
  list!.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest('.command-palette-item') as HTMLElement | null;
    if (target) {
      const clickedId = target.getAttribute('data-item-id');
      const clickedIndex = filteredItems.findIndex(item => item.id === clickedId);
      if (clickedIndex >= 0) navigateToItem(clickedIndex);
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
