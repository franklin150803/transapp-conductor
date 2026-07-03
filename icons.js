// js/icons.js
// Diccionario de iconos de la app (SVG de solo trazo, sin fondo) + utilidades
// de presentacion compartidas (appIcon para insertar un icono, escapeHtml
// para evitar XSS al insertar texto dinamico). Este archivo no depende
// de ningun otro modulo de la app; debe cargarse antes de los demas
// scripts porque ellos usan appIcon()/escapeHtml() globalmente.
//
// PARTE 45: antes estos iconos eran PNG en base64 con fondo solido (se
// veian como "stickers" pegados sobre cualquier color). Ahora son SVG con
// stroke="currentColor" y fill="none": heredan el color de texto del
// contenedor (blanco sobre fondos oscuros/de color, azul cuando el tab
// esta activo, etc.) y no tienen ningun fondo propio.

(function () {
  var SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  window.APP_ICONS = {
    bus:
      '<path d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10"/>' +
      '<path d="M4 16a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1M18 16a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1"/>' +
      '<path d="M4 11h16"/>' +
      '<path d="M7 16v2M17 16v2"/>' +
      '<circle cx="7.5" cy="16" r="1.5"/>' +
      '<circle cx="16.5" cy="16" r="1.5"/>',

    smartphone:
      '<rect x="6" y="2" width="12" height="20" rx="2" ry="2"/>' +
      '<line x1="12" y1="18" x2="12.01" y2="18"/>',

    settings:
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',

    search:
      '<circle cx="11" cy="11" r="8"/>' +
      '<line x1="21" y1="21" x2="16.65" y2="16.65"/>',

    clock:
      '<circle cx="12" cy="12" r="10"/>' +
      '<polyline points="12 6 12 12 16 14"/>',

    map:
      '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>' +
      '<line x1="8" y1="2" x2="8" y2="18"/>' +
      '<line x1="16" y1="6" x2="16" y2="22"/>',

    shieldCheck:
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
      '<polyline points="8.5 12 11 14.5 15.5 9.5"/>',

    gift:
      '<polyline points="20 12 20 22 4 22 4 12"/>' +
      '<rect x="2" y="7" width="20" height="5"/>' +
      '<line x1="12" y1="22" x2="12" y2="7"/>' +
      '<path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>' +
      '<path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C9 2 12 7 12 7z"/>',

    mapPin:
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' +
      '<circle cx="12" cy="10" r="3"/>',

    bell:
      '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>' +
      '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>',

    building:
      '<rect x="4" y="2" width="16" height="20" rx="1"/>' +
      '<line x1="8" y1="6" x2="8" y2="6"/>' +
      '<line x1="12" y1="6" x2="12" y2="6"/>' +
      '<line x1="16" y1="6" x2="16" y2="6"/>' +
      '<line x1="8" y1="10" x2="8" y2="10"/>' +
      '<line x1="12" y1="10" x2="12" y2="10"/>' +
      '<line x1="16" y1="10" x2="16" y2="10"/>' +
      '<line x1="8" y1="14" x2="8" y2="14"/>' +
      '<line x1="12" y1="14" x2="12" y2="14"/>' +
      '<line x1="16" y1="14" x2="16" y2="14"/>' +
      '<path d="M9 22v-4h6v4"/>',

    plus:
      '<line x1="12" y1="5" x2="12" y2="19"/>' +
      '<line x1="5" y1="12" x2="19" y2="12"/>',

    flag:
      '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
      '<line x1="4" y1="22" x2="4" y2="15"/>',

    star:
      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',

    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/>' +
      '<line x1="21" y1="12" x2="9" y2="12"/>',
  };

  // Genera el markup de un icono a partir del diccionario de iconos de la
  // app. size: tamano en px (cuadrado). className: clases css opcionales.
  // Devuelve un <svg> inline (stroke="currentColor", fill="none", sin
  // fondo propio) en vez del <img> con PNG que se usaba antes.
  window.appIcon = function (name, size, className) {
    size = size || 20;
    className = className ? ' ' + className : '';
    var body = window.APP_ICONS[name] || '';
    return '<svg class="app-icon' + className + '" ' + SVG_ATTRS +
      ' width="' + size + '" height="' + size + '" style="display:inline-block;vertical-align:middle;flex-shrink:0;">' +
      body + '</svg>';
  };

  // Escapa caracteres peligrosos antes de insertar texto via innerHTML.
  // Cualquier dato que venga de Firebase (nombre de empresa, placa,
  // nombre de conductor, etc.) debe pasar por aqui para evitar XSS:
  // si alguien registra una empresa con un nombre que contiene
  // codigo de script o atributos como onerror=, esto lo neutraliza
  // dejandolo como texto plano en vez de codigo ejecutable.
  window.escapeHtml = function (value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
})();
