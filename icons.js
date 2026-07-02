// js/icons.js
// Diccionario de iconos de la app (SVG puro) + utilidades compartidas.

// Propiedades compartidas para mantener un diseño 'outline' estrictamente uniforme:
// Borde blanco, sin relleno, grosor 2px, bordes redondeados.
const SVG_PROPS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

window.APP_ICONS = {
    bus: `<svg ${SVG_PROPS}><path d="M4 6c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V6z"/><path d="M4 18v2c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2v-2"/><path d="M16 18v2c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2v-2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>`,
    
    smartphone: `<svg ${SVG_PROPS}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>`,
    
    settings: `<svg ${SVG_PROPS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    
    menu: `<svg ${SVG_PROPS}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    
    search: `<svg ${SVG_PROPS}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    
    location: `<svg ${SVG_PROPS}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    
    clock: `<svg ${SVG_PROPS}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    
    user: `<svg ${SVG_PROPS}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    
    arrow_back: `<svg ${SVG_PROPS}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`
};

window.escapeHtml = function(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};

// Modificación clave: En lugar de devolver un tag <img> con un src en Base64, 
// ahora inyectamos el nodo <svg> directamente en el DOM, asignando las clases necesarias.
window.appIcon = function(iconName, className = '') {
    const svgString = window.APP_ICONS[iconName];
    if (!svgString) {
        console.warn(`Icono no encontrado: ${iconName}`);
        return '';
    }
    // Inyecta las clases seguras dentro de la etiqueta <svg> de apertura
    return svgString.replace('<svg ', `<svg class="app-icon ${escapeHtml(className)}" `);
};
