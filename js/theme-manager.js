/**
 * Theme Manager - Handles dark/light theme switching
 */
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'dark';
        this.applyTheme(this.theme);
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.theme = theme;
        localStorage.setItem('theme', theme);
        this.updateToggleButtons();
        this.updateThemeSelectors();
    }

    toggleTheme() {
        const newTheme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
    }

    updateToggleButtons() {
        const buttons = document.querySelectorAll('.theme-toggle');
        buttons.forEach(btn => {
            const icon = btn.querySelector('i');
            if (icon) {
                if (this.theme === 'dark') {
                    icon.className = 'fas fa-sun';
                    btn.title = 'Switch to Light Mode';
                } else {
                    icon.className = 'fas fa-moon';
                    btn.title = 'Switch to Dark Mode';
                }
            }
        });
    }

    updateThemeSelectors() {
        const selectors = document.querySelectorAll('#themeSelect');
        selectors.forEach(select => {
            select.value = this.theme;
        });
    }
}

// Global instance
window.themeManager = new ThemeManager();

