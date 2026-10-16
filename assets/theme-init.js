// Set the saved appearance before the document body is painted.
(function () {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem('fx-settings')) || {}; } catch (_) {}
    let theme = prefs.theme;
    if (theme !== 'light' && theme !== 'dark') {
        // Preserve the existing dark appearance for upgrades from 1.0.0.
        theme = prefs.base ? 'dark' : 'light';
        if (!prefs.base && window.AndroidFX && typeof window.AndroidFX.getAppearance === 'function') {
            try { theme = window.AndroidFX.getAppearance(); } catch (_) {}
        }
    }
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
})();
