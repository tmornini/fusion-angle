// Pre-bundle initialization that runs before app.js loads.
// Reads persisted theme + sidebar-collapsed preferences from
// localStorage and applies them to the documentElement so the
// page paints in the correct state. Inline-script equivalent
// of FOUC prevention; extracted to a same-origin file so a
// strict Content-Security-Policy (script-src 'self') can
// forbid inline scripts.

(function applyTheme(): void {
    const stored = localStorage.getItem(
        'fusion-theme',
    );
    const dark = stored === 'dark'
        || (stored !== 'light'
            && matchMedia(
                '(prefers-color-scheme: dark)',
            ).matches);
    if (dark) {
        const root = document.documentElement;
        root.setAttribute('data-theme', 'dark');
        root.classList.add('dark');
    }
})();

(function applySidebarCollapsed(): void {
    const stored = localStorage.getItem(
        'fusion-sidebar-collapsed',
    );
    if (stored === 'true') {
        document.documentElement.classList.add(
            'sidebar-collapsed',
        );
    }
})();
