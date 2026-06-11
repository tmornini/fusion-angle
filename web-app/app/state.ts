import {
    putPreference,
    getStoredTheme,
    getStoredSidebarCollapsed,
    isStoredTheme,
    BOOL_STRING_TRUE,
    BOOL_STRING_FALSE,
    type StoredTheme,
} from './adapters/preferences.ts';
import {
    mediaQueryMatches,
    subscribeMediaQuery,
} from './adapters/media-query.ts';
import {
    subscribeStorageEvent,
} from './adapters/storage-event.ts';
import {
    STORAGE_KEY_THEME,
    STORAGE_KEY_SIDEBAR,
} from './storage-keys.ts';
import {
    iconSun,
    iconMoon,
    iconMonitor,
} from './icons.ts';
import type { SafeHtml } from './safe-html.ts';

interface AppState {
    theme: StoredTheme;
    isSidebarCollapsed: boolean;
}

const DARK_QUERY =
    '(prefers-color-scheme: dark)';

// State starts at pure domain defaults so importing
// this module touches neither localStorage nor window.
// initState() hydrates the persisted preferences at
// boot — see core.ts DOMContentLoaded.
let state: Readonly<AppState> = {
    theme: 'system',
    isSidebarCollapsed: false,
};

function setState(
    partial: Partial<AppState>,
): void {
    state = { ...state, ...partial };
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

// Returns true when the preference was
// persisted to localStorage; false when
// the write was skipped (quota). The
// theme is applied to in-memory state
// and DOM either way so the user's
// click is honored for the session.
function persistThemePreference(
    theme: AppState['theme'],
): boolean {
    setState({ theme });
    applyResolvedTheme();
    return putPreference(
        STORAGE_KEY_THEME,
        theme,
    );
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
    putPreference(
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

function initState(): void {
    setState({
        theme: getStoredTheme(),
        isSidebarCollapsed:
            getStoredSidebarCollapsed(),
    });
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

    subscribeStorageEvent((e) => {
        if (
            e.key === STORAGE_KEY_THEME
            && isStoredTheme(e.newValue)
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
    });
}

export type { AppState };
export {
    computeTheme,
    getThemeIcon,
    applyResolvedTheme,
    persistThemePreference,
    collapseSidebar,
    initState,
    initListeners,
};
