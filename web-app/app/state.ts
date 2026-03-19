import { log } from './logger';

const STORAGE_KEY_THEME = 'fusion-theme';
const STORAGE_KEY_SIDEBAR =
    'fusion-sidebar-collapsed';
const MOBILE_BREAKPOINT_PX = 768;

interface AppState {
  theme: 'light' | 'dark' | 'system';
  isMobile: boolean;
  isSidebarCollapsed: boolean;
  isSidebarOpen: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
}

type StateListener = () => void;

function isValidTheme(value: string | null): value is AppState['theme'] {
  return value === 'light' || value === 'dark' || value === 'system';
}

const _state: AppState = {
  theme: (() => {
    const raw = localStorage
      .getItem(STORAGE_KEY_THEME);
    return isValidTheme(raw) ? raw : 'system';
  })(),
  isMobile: window.matchMedia(
    `(max-width: ${MOBILE_BREAKPOINT_PX}px)`,
  ).matches,
  isSidebarCollapsed: false,
  isSidebarOpen: false,
  isSearchOpen: false,
  searchQuery: '',
};

const state: Readonly<AppState> = _state;

const listeners = new Set<StateListener>();

function setState(partial: Partial<AppState>): void {
  Object.assign(_state, partial);
  listeners.forEach(fn => fn());
}

function subscribe(fn: StateListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function computeTheme(): 'light' | 'dark' {
  if (state.theme === 'system') {
    const query =
      '(prefers-color-scheme: dark)';
    return window.matchMedia(query).matches
      ? 'dark'
      : 'light';
  }
  return state.theme;
}

function applyTheme(): void {
  const resolved = computeTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

function setTheme(theme: AppState['theme']): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_THEME,
      theme,
    );
  } catch {
    log.debug(
      'Failed to save theme preference',
      'state',
    );
  }
  setState({ theme });
  applyTheme();
}

const darkQuery = '(prefers-color-scheme: dark)';
window.matchMedia(darkQuery)
  .addEventListener('change', () => {
  if (state.theme === 'system') applyTheme();
});

const mobileQuery =
  `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
window.matchMedia(mobileQuery)
  .addEventListener('change', (e) => {
  setState({ isMobile: e.matches });
  if (!e.matches) setState({ isSidebarOpen: false, isSearchOpen: false });
});

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_THEME && isValidTheme(e.newValue)) {
    setState({ theme: e.newValue });
    applyTheme();
  }
});

export type { AppState };
export {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
    state,
    setState,
    subscribe,
    computeTheme,
    applyTheme,
    setTheme,
    isValidTheme,
};
