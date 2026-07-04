// accessibility.js
// Parte 48: accesibilidad basica del pasajero — texto grande y alto
// contraste, ambos como toggles que se guardan en localStorage y se
// aplican al instante (sin recargar la pagina) agregando/quitando clases
// sobre <html>. Se aplican apenas carga el script (antes de que termine
// de pintarse el resto de la UI) para evitar el "flash" de texto/colores
// normales que luego cambian de golpe.
// Depende de setPanelBackdrop() (definida en passenger.js, usada despues
// de que el DOM ya esta listo, asi que el orden de carga no importa aqui).

        const A11Y_LARGE_TEXT_KEY = 'vura_a11y_large_text';
        const A11Y_HIGH_CONTRAST_KEY = 'vura_a11y_high_contrast';

        function applyA11ySettingsOnLoad() {
            let largeText = false;
            let highContrast = false;
            try {
                largeText = localStorage.getItem(A11Y_LARGE_TEXT_KEY) === '1';
                highContrast = localStorage.getItem(A11Y_HIGH_CONTRAST_KEY) === '1';
            } catch (e) {}

            document.documentElement.classList.toggle('a11y-large-text', largeText);
            document.documentElement.classList.toggle('a11y-high-contrast', highContrast);
        }

        // Se llama una vez que el DOM ya tiene los checkboxes del panel,
        // para que reflejen el estado guardado la primera vez que se abre.
        function syncA11yTogglesUi() {
            const largeBox = document.getElementById('a11yLargeTextToggle');
            const contrastBox = document.getElementById('a11yHighContrastToggle');
            if (largeBox) largeBox.checked = document.documentElement.classList.contains('a11y-large-text');
            if (contrastBox) contrastBox.checked = document.documentElement.classList.contains('a11y-high-contrast');
        }

        function toggleA11yLargeText(enabled) {
            document.documentElement.classList.toggle('a11y-large-text', enabled);
            try { localStorage.setItem(A11Y_LARGE_TEXT_KEY, enabled ? '1' : '0'); } catch (e) {}
        }

        function toggleA11yHighContrast(enabled) {
            document.documentElement.classList.toggle('a11y-high-contrast', enabled);
            try { localStorage.setItem(A11Y_HIGH_CONTRAST_KEY, enabled ? '1' : '0'); } catch (e) {}
        }

        function openAccessibilityPanel() {
            syncA11yTogglesUi();
            document.getElementById('accessibilityPanel').classList.add('show');
            setPanelBackdrop(true);
        }

        function closeAccessibilityPanel() {
            document.getElementById('accessibilityPanel').classList.remove('show');
            setPanelBackdrop(false);
        }

        window.toggleA11yLargeText = toggleA11yLargeText;
        window.toggleA11yHighContrast = toggleA11yHighContrast;
        window.openAccessibilityPanel = openAccessibilityPanel;
        window.closeAccessibilityPanel = closeAccessibilityPanel;

        applyA11ySettingsOnLoad();
