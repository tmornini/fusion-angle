// ============================================
// FUSION AI — State Management
// App state, pub-sub, theme, mobile detection
// ============================================

// ------------------------------------
// localStorage Key Constants
// ------------------------------------

const STORAGE_KEY_THEME = 'fusion-theme';
const STORAGE_KEY_SIDEBAR = 'fusion-sidebar-collapsed';

// ------------------------------------
// State Management
// ------------------------------------

interface AppState {
  theme: 'light' | 'dark' | 'system';
  isMobile: boolean;
  isSidebarCollapsed: boolean;
  isSidebarOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  user: { name: string; email: string; company: string } | null;
}

type StateListener = () => void;

const state: AppState = {
  theme: (localStorage.getItem(STORAGE_KEY_THEME) as AppState['theme']) || 'system',
  isMobile: window.matchMedia('(max-width: 768px)').matches,
  isSidebarCollapsed: false,
  isSidebarOpen: false,
  isSearchOpen: false,
  searchQuery: '',
  user: { name: 'Demo User', email: 'demo@example.com', company: 'Demo Company' },
};

const listeners = new Set<StateListener>();

function setState(partial: Partial<AppState>): void {
  Object.assign(state, partial);
  listeners.forEach(fn => fn());
}

function subscribe(fn: StateListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ------------------------------------
// Theme
// ------------------------------------

function computeTheme(): 'light' | 'dark' {
  if (state.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return state.theme;
}

function applyTheme(): void {
  const resolved = computeTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  // Also set class for any CSS that uses .dark selector
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function setTheme(theme: AppState['theme']): void {
  localStorage.setItem(STORAGE_KEY_THEME, theme);
  setState({ theme });
  applyTheme();
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme();
});

// ------------------------------------
// Mobile Detection
// ------------------------------------

window.matchMedia('(max-width: 768px)').addEventListener('change', (e) => {
  setState({ isMobile: e.matches });
  if (!e.matches) setState({ isSidebarOpen: false, isSearchOpen: false });
});

export type { AppState };
export { STORAGE_KEY_THEME, STORAGE_KEY_SIDEBAR, state, setState, subscribe, computeTheme, applyTheme, setTheme };
