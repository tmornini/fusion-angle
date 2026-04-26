import {
    getPreference,
    writePreference,
} from './preferences-store';

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
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new Error(
        'corrupt stored sidebar state: '
            + raw,
    );
}

let state: Readonly<AppState> = {
    theme: loadStoredTheme(),
    isMobile: window.matchMedia(
        '(max-width: '
        + MOBILE_BREAKPOINT_PX
        + 'px)',
    ).matches,
    isSidebarCollapsed:
        loadStoredSidebarCollapsed(),
    isSidebarOpen: false,
    isSearchOpen: false,
    searchQuery: '',
};

const subs = new Set<StateListener>();

function setState(
    partial: Partial<AppState>,
): void {
    state = { ...state, ...partial };
    subs.forEach(fn => fn());
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
        const darkMediaQuery
            = '(prefers-color-scheme: dark)';
        return window
            .matchMedia(darkMediaQuery)
            .matches
            ? 'dark'
            : 'light';
    }
    return state.theme;
}

function applyTheme(): void {
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

function setTheme(
    theme: AppState['theme'],
): void {
    writePreference(
        STORAGE_KEY_THEME,
        theme,
    );
    setState({ theme });
    applyTheme();
}

function setSidebarCollapsed(
    collapsed: boolean,
): void {
    writePreference(
        STORAGE_KEY_SIDEBAR,
        String(collapsed),
    );
    setState({
        isSidebarCollapsed: collapsed,
    });
}

function initListeners(): void {
    const darkQ =
        '(prefers-color-scheme: dark)';
    window.matchMedia(darkQ)
        .addEventListener(
            'change',
            () => {
                if (
                    state.theme === 'system'
                ) {
                    applyTheme();
                }
            },
        );

    const mobileQ = '(max-width: '
        + MOBILE_BREAKPOINT_PX
        + 'px)';
    window.matchMedia(mobileQ)
        .addEventListener(
            'change',
            (e) => {
                setState({
                    isMobile: e.matches,
                });
                if (!e.matches) {
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
                applyTheme();
            }
            if (
                e.key === STORAGE_KEY_SIDEBAR
                && (
                    e.newValue === 'true'
                    || e.newValue === 'false'
                )
            ) {
                const collapsed =
                    e.newValue === 'true';
                setState({
                    isSidebarCollapsed:
                        collapsed,
                });
                document.documentElement
                    .classList.toggle(
                        'sidebar-collapsed',
                        collapsed,
                    );
            }
        },
    );
}

initListeners();

export type { AppState };
export {
    STORAGE_KEY_THEME,
    state,
    setState,
    subscribe,
    computeTheme,
    applyTheme,
    setTheme,
    setSidebarCollapsed,
    isValidTheme,
};
