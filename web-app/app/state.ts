import {
    putPreference,
    getStoredSidebarCollapsed,
    BOOL_STRING_TRUE,
    BOOL_STRING_FALSE,
} from './adapters/preferences.ts';
import {
    subscribeStorageEvent,
} from './adapters/storage-event.ts';
import {
    STORAGE_KEY_SIDEBAR,
} from './storage-keys.ts';

interface AppState {
    isSidebarCollapsed: boolean;
}

// State starts at pure domain defaults so importing
// this module touches neither localStorage nor window.
// initState() hydrates the persisted preference at
// boot — see core.ts DOMContentLoaded.
let state: Readonly<AppState> = {
    isSidebarCollapsed: false,
};

function setState(
    partial: Partial<AppState>,
): void {
    state = { ...state, ...partial };
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
        isSidebarCollapsed:
            getStoredSidebarCollapsed(),
    });
}

function initListeners(): void {
    subscribeStorageEvent((e) => {
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
    collapseSidebar,
    initState,
    initListeners,
};
