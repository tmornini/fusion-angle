import {
    getPreference,
    writePreference,
} from './adapters/preferences.ts';
import {
    mediaQueryMatches,
    subscribeMediaQuery,
} from './adapters/media-query.ts';
import {
    iconSun,
    iconMoon,
    iconMonitor,
} from './icons.ts';
import type { SafeHtml } from './safe-html.ts';

const STORAGE_KEY_THEME = 'fusion-theme';
const STORAGE_KEY_SIDEBAR =
    'fusion-sidebar-collapsed';
const MOBILE_BREAKPOINT_PX = 768;
const BOOL_STRING_TRUE = 'true';
const BOOL_STRING_FALSE = 'false';

interface AppState {
    theme: 'light' | 'dark' | 'system';
    isMobile: boolean;
    isSidebarCollapsed: boolean;
    isSidebarOpen: boolean;
    isSearchOpen: boolean;
    searchQuery: string;
}

type StateListener = () => void;

function isValidTheme(
    value: string | null,
): value is AppState['theme'] {
    return value === 'light'
        || value === 'dark'
        || value === 'system';
}

function loadStoredTheme(
): AppState['theme'] {
    const raw = getPreference(
        STORAGE_KEY_THEME,
    );
    if (raw === null) return 'system';
    if (isValidTheme(raw)) return raw;
    throw new Error(
        'corrupt stored theme: ' + raw,
    );
}

function loadStoredSidebarCollapsed(
): boolean {
    const raw = getPreference(
        STORAGE_KEY_SIDEBAR,
    );
    if (raw === null) return false;
    if (raw === BOOL_STRING_TRUE) return true;
    if (raw === BOOL_STRING_FALSE) return false;
    throw new Error(
        'corrupt stored sidebar state: '
            + raw,
    );
}

const MOBILE_QUERY = '(max-width: '
    + MOBILE_BREAKPOINT_PX
    + 'px)';
const DARK_QUERY =
    '(prefers-color-scheme: dark)';

let state: Readonly<AppState> = {
    theme: loadStoredTheme(),
    isMobile: mediaQueryMatches(MOBILE_QUERY),
    isSidebarCollapsed:
        loadStoredSidebarCollapsed(),
    isSidebarOpen: false,
    isSearchOpen: false,
    searchQuery: '',
};

const subs = new Set<StateListener>();

function getState(): Readonly<AppState> {
    return state;
}

function setState(
    partial: Partial<AppState>,
): void {
    state = { ...state, ...partial };
    const snapshot = [...subs];
    snapshot.forEach(fn => fn());
}

function subscribe(
    fn: StateListener,
): () => void {
    subs.add(fn);
    return () => {
        subs.delete(fn);
    };
}

function computeTheme(): 'light' | 'dark' {
    if (state.theme === 'system') {
        return mediaQueryMatches(DARK_QUERY)
            ? 'dark'
            : 'light';
    }
    return state.theme;
}

function getThemeIcon(
    size: number,
    cssClass: string,
): SafeHtml {
    if (state.theme === 'dark') {
        return iconMoon(size, cssClass);
    }
    if (state.theme === 'light') {
        return iconSun(size, cssClass);
    }
    return iconMonitor(size, cssClass);
}

function applyResolvedTheme(): void {
    const resolved = computeTheme();
    document.documentElement
        .setAttribute(
            'data-theme',
            resolved,
        );
    document.documentElement
        .classList.toggle(
            'dark',
            resolved === 'dark',
        );
}

function persistThemePreference(
    theme: AppState['theme'],
): void {
    writePreference(
        STORAGE_KEY_THEME,
        theme,
    );
    setState({ theme });
    applyResolvedTheme();
}

function applySidebarCollapsed(
    collapsed: boolean,
): void {
    document.documentElement
        .classList.toggle(
            'sidebar-collapsed',
            collapsed,
        );
}

function collapseSidebar(
    collapsed: boolean,
): void {
    writePreference(
        STORAGE_KEY_SIDEBAR,
        collapsed
            ? BOOL_STRING_TRUE
            : BOOL_STRING_FALSE,
    );
    setState({
        isSidebarCollapsed: collapsed,
    });
    applySidebarCollapsed(collapsed);
}

function initListeners(): void {
    subscribeMediaQuery(
        DARK_QUERY,
        () => {
            if (state.theme === 'system') {
                applyResolvedTheme();
            }
        },
    );

    subscribeMediaQuery(
        MOBILE_QUERY,
        (matches) => {
            setState({ isMobile: matches });
            if (!matches) {
                setState({
                    isSidebarOpen: false,
                    isSearchOpen: false,
                });
            }
        },
    );

    window.addEventListener(
        'storage',
        (e) => {
            if (
                e.key === STORAGE_KEY_THEME
                && isValidTheme(e.newValue)
            ) {
                setState({
                    theme: e.newValue,
                });
                applyResolvedTheme();
            }
            if (
                e.key === STORAGE_KEY_SIDEBAR
                && (
                    e.newValue
                        === BOOL_STRING_TRUE
                    || e.newValue
                        === BOOL_STRING_FALSE
                )
            ) {
                const collapsed =
                    e.newValue
                        === BOOL_STRING_TRUE;
                setState({
                    isSidebarCollapsed:
                        collapsed,
                });
                applySidebarCollapsed(
                    collapsed,
                );
            }
        },
    );
}

export type { AppState };
export {
    STORAGE_KEY_THEME,
    getState,
    setState,
    subscribe,
    computeTheme,
    getThemeIcon,
    applyResolvedTheme,
    persistThemePreference,
    collapseSidebar,
    isValidTheme,
    initListeners,
};
