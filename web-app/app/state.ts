import { showToast } from './toast';

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

class AppStateManager {
    private readonly data: AppState;
    private readonly subs =
        new Set<StateListener>();
    readonly state: Readonly<AppState>;

    constructor() {
        this.data = {
            theme: (() => {
                const raw = localStorage
                    .getItem(STORAGE_KEY_THEME);
                return isValidTheme(raw)
                    ? raw
                    : 'system';
            })(),
            isMobile: window.matchMedia(
                '(max-width: '
                + MOBILE_BREAKPOINT_PX
                + 'px)',
            ).matches,
            isSidebarCollapsed:
                localStorage.getItem(
                    STORAGE_KEY_SIDEBAR,
                ) === 'true',
            isSidebarOpen: false,
            isSearchOpen: false,
            searchQuery: '',
        };
        this.state = this.data;
        this.initListeners();
    }

    setState(
        partial: Partial<AppState>,
    ): void {
        Object.assign(this.data, partial);
        this.subs.forEach(fn => fn());
    }

    subscribe(
        fn: StateListener,
    ): () => void {
        this.subs.add(fn);
        return () => {
            this.subs.delete(fn);
        };
    }

    computeTheme(): 'light' | 'dark' {
        if (this.state.theme === 'system') {
            const q = '(prefers-color-scheme'
                + ': dark)';
            return window
                .matchMedia(q).matches
                ? 'dark'
                : 'light';
        }
        return this.state.theme;
    }

    applyTheme(): void {
        const resolved =
            this.computeTheme();
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

    setTheme(
        theme: AppState['theme'],
    ): void {
        try {
            localStorage.setItem(
                STORAGE_KEY_THEME,
                theme,
            );
        } catch {
            showToast(
                'Failed to save theme'
                + ' preference.',
                'error',
            );
        }
        this.setState({ theme });
        this.applyTheme();
    }

    setSidebarCollapsed(
        collapsed: boolean,
    ): void {
        try {
            localStorage.setItem(
                STORAGE_KEY_SIDEBAR,
                String(collapsed),
            );
        } catch {
            showToast(
                'Failed to save'
                + ' sidebar state.',
                'error',
            );
        }
        this.setState({
            isSidebarCollapsed: collapsed,
        });
    }

    private initListeners(): void {
        const darkQ =
            '(prefers-color-scheme: dark)';
        window.matchMedia(darkQ)
            .addEventListener(
                'change',
                () => {
                    if (
                        this.state.theme
                            === 'system'
                    ) {
                        this.applyTheme();
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
                    this.setState({
                        isMobile: e.matches,
                    });
                    if (!e.matches) {
                        this.setState({
                            isSidebarOpen:
                                false,
                            isSearchOpen:
                                false,
                        });
                    }
                },
            );

        window.addEventListener(
            'storage',
            (e) => {
                if (
                    e.key
                        === STORAGE_KEY_THEME
                    && isValidTheme(
                        e.newValue,
                    )
                ) {
                    this.setState({
                        theme: e.newValue,
                    });
                    this.applyTheme();
                }
            },
        );
    }
}

const mgr = new AppStateManager();

const state: Readonly<AppState> = mgr.state;

function setState(
    partial: Partial<AppState>,
): void {
    mgr.setState(partial);
}

function subscribe(
    fn: StateListener,
): () => void {
    return mgr.subscribe(fn);
}

function computeTheme(): 'light' | 'dark' {
    return mgr.computeTheme();
}

function applyTheme(): void {
    mgr.applyTheme();
}

function setTheme(
    theme: AppState['theme'],
): void {
    mgr.setTheme(theme);
}

function setSidebarCollapsed(
    collapsed: boolean,
): void {
    mgr.setSidebarCollapsed(collapsed);
}

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
