// osm-routes.js
// Carga rutas reales de OSM desde archivos GeoJSON en GitHub Pages
// y las pinta en el mapa de Leaflet como capa pública.
// NO toca companies, Firebase, ni ninguna variable existente.
// Debe cargarse DESPUÉS de map.js (necesita que `map` exista).

(function () {

    // ================================================================
    // CONFIGURACIÓN — solo cambia esta sección al agregar distritos
    // ================================================================
    const BASE_URL = 'https://willowy-tiramisu-73a7ad.netlify.app/rutas/';

    const DISTRITOS = [
        { archivo: 'bellavista.geojson',   nombre: 'Bellavista'   },
        // Agrega más distritos aquí cuando los tengas listos:
        // { archivo: 'callao-cercado.geojson', nombre: 'Callao Cercado' },
        // { archivo: 'la-perla.geojson',       nombre: 'La Perla'       },
        // { archivo: 'smp.geojson',            nombre: 'SMP'            },
    ];

    // Colores de las rutas OSM (diferentes a las rutas de empresas
    // para que el usuario las distinga visualmente)
    const COLOR_OSM   = '#2563eb';   // azul Vura — rutas públicas
    const OPACITY_OSM = 0.35;        // semitransparentes para no tapar las de empresas
    const WEIGHT_OSM  = 1.8;

    // ================================================================
    // ESTADO INTERNO
    // ================================================================
    let osmLayers = [];          // capas Leaflet activas
    let cargado   = false;       // evitar doble carga

    // ================================================================
    // CONVERTIR GeoJSON OSM → coordenadas Leaflet [lat, lng]
    // OSM usa [lng, lat], Leaflet usa [lat, lng] — hay que invertir
    // ================================================================
    function geojsonToLeafletLines(geojson) {
        const lineas = [];

        geojson.features.forEach(function (feature) {
            if (!feature.geometry) return;
            const tipo = feature.geometry.type;

            if (tipo === 'LineString') {
                const coords = feature.geometry.coordinates.map(function (c) {
                    return [c[1], c[0]]; // [lng,lat] → [lat,lng]
                });
                if (coords.length >= 2) lineas.push(coords);

            } else if (tipo === 'MultiLineString') {
                feature.geometry.coordinates.forEach(function (linea) {
                    const coords = linea.map(function (c) {
                        return [c[1], c[0]];
                    });
                    if (coords.length >= 2) lineas.push(coords);
                });
            }
        });

        return lineas;
    }

    // ================================================================
    // CARGAR UN DISTRITO
    // ================================================================
    async function cargarDistrito(distrito) {
        const url = BASE_URL + distrito.archivo;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const geojson = await res.json();

            const lineas = geojsonToLeafletLines(geojson);
            let agregadas = 0;

            lineas.forEach(function (coords) {
                const polyline = L.polyline(coords, {
                    color:     COLOR_OSM,
                    weight:    WEIGHT_OSM,
                    opacity:   OPACITY_OSM,
                    smoothFactor: 1.5,
                    interactive: false,      // no interfiere con clics en vehículos
                    className: 'osm-route-layer'
                });

                // Asegurarse de que el mapa ya existe
                if (window.map) {
                    polyline.addTo(window.map);
                    polyline.bringToBack(); // debajo de rutas de empresas y marcadores
                    osmLayers.push(polyline);
                    agregadas++;
                }
            });

            console.log('[Vura OSM] ' + distrito.nombre + ': ' + agregadas + ' líneas cargadas');

        } catch (err) {
            // Si el archivo no existe todavía, falla silenciosamente
            console.warn('[Vura OSM] No se pudo cargar ' + distrito.nombre + ':', err.message);
        }
    }

    // ================================================================
    // CARGAR TODOS LOS DISTRITOS CONFIGURADOS
    // ================================================================
    async function cargarTodosLosDistritos() {
        if (cargado) return;
        cargado = true;

        // Cargar en paralelo — si uno falla, los demás siguen
        await Promise.allSettled(
            DISTRITOS.map(function (d) { return cargarDistrito(d); })
        );

        console.log('[Vura OSM] Carga completa. Total capas: ' + osmLayers.length);
    }

    // ================================================================
    // FUNCIONES PÚBLICAS (por si se necesitan desde otros scripts)
    // ================================================================

    // Ocultar/mostrar todas las rutas OSM (para un toggle futuro)
    window.osmRoutesSetVisible = function (visible) {
        osmLayers.forEach(function (layer) {
            if (window.map) {
                if (visible) layer.addTo(window.map);
                else window.map.removeLayer(layer);
            }
        });
    };

    // Cuántas líneas OSM están cargadas
    window.osmRoutesCount = function () { return osmLayers.length; };

    // ================================================================
    // ARRANQUE — esperar a que el mapa esté listo
    // ================================================================
    function arrancar() {
        // Si el mapa ya existe, cargamos de inmediato
        if (window.map) {
            cargarTodosLosDistritos();
            return;
        }

        // Si no, esperamos máximo 10 segundos a que initMap() lo cree
        let intentos = 0;
        const intervalo = setInterval(function () {
            intentos++;
            if (window.map) {
                clearInterval(intervalo);
                cargarTodosLosDistritos();
            } else if (intentos > 100) {
                clearInterval(intervalo);
                console.warn('[Vura OSM] El mapa no se inicializó — rutas OSM no cargadas.');
            }
        }, 100);
    }

    // Ejecutar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }

})();
