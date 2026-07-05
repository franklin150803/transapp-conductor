// osm-routes.js v3 — rutas OSM como capas nativas de MapLibre GL
// Así las rutas siguen el 3D/pitch/bearing del mapa correctamente.
// Requiere window.glMap (expuesto en map.js) y window.map (Leaflet).

(function () {

    const BASE_URL = 'https://willowy-tiramisu-73a7ad.netlify.app/rutas/';

    const DISTRITOS = [
        { archivo: 'bellavista.geojson', nombre: 'bellavista' },
        // { archivo: 'callao-cercado.geojson', nombre: 'callao-cercado' },
        // { archivo: 'smp.geojson',             nombre: 'smp'            },
    ];

    // Color y estilo de rutas OSM en MapLibre
    const COLOR_OSM   = '#2563eb';
    const OPACITY_OSM = 0.4;
    const WIDTH_OSM   = 2;

    let cargado = false;

    // ================================================================
    // AGREGAR UNA FUENTE + CAPA MAPLIBRE POR DISTRITO
    // ================================================================
    async function cargarDistrito(glMap, distrito) {
        const url = BASE_URL + distrito.archivo + '.geojson';
        const sourceId = 'osm-' + distrito.nombre;
        const layerId  = 'osm-layer-' + distrito.nombre;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const geojson = await res.json();

            // OSM usa [lng, lat] — MapLibre también usa [lng, lat], OK directo
            // Solo necesitamos limpiar las propiedades innecesarias
            const limpio = {
                type: 'FeatureCollection',
                features: geojson.features.filter(f =>
                    f.geometry &&
                    (f.geometry.type === 'LineString' ||
                     f.geometry.type === 'MultiLineString')
                )
            };

            // Eliminar fuente/capa si ya existía (por si se recarga)
            if (glMap.getLayer(layerId))  glMap.removeLayer(layerId);
            if (glMap.getSource(sourceId)) glMap.removeSource(sourceId);

            // Agregar fuente GeoJSON
            glMap.addSource(sourceId, {
                type: 'geojson',
                data: limpio,
                tolerance: 0.5  // simplificación extra para rendimiento
            });

            // Agregar capa de líneas
            glMap.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap':  'round'
                },
                paint: {
                    'line-color':   COLOR_OSM,
                    'line-width':   WIDTH_OSM,
                    'line-opacity': OPACITY_OSM
                }
            // Insertar ANTES de las capas de rutas de empresas para quedar debajo
            }, getFirstSymbolLayer(glMap));

            console.log('[Vura OSM] ' + distrito.nombre + ': ' +
                        limpio.features.length + ' features cargadas en MapLibre');

        } catch (e) {
            console.warn('[Vura OSM] Error en ' + distrito.nombre + ':', e.message);
        }
    }

    // Encontrar la primera capa de símbolos para insertar debajo
    function getFirstSymbolLayer(glMap) {
        const layers = glMap.getStyle().layers;
        for (const layer of layers) {
            if (layer.type === 'symbol') return layer.id;
        }
        return undefined; // si no hay símbolos, agrega al final
    }

    // ================================================================
    // CARGAR TODOS LOS DISTRITOS
    // ================================================================
    async function cargarTodo(glMap) {
        if (cargado) return;
        cargado = true;

        // Esperar a que el estilo de MapLibre esté listo
        if (!glMap.isStyleLoaded()) {
            await new Promise(resolve => glMap.once('styledata', resolve));
        }

        await Promise.allSettled(
            DISTRITOS.map(d => cargarDistrito(glMap, d))
        );
        console.log('[Vura OSM] Carga completa');
    }

    // ================================================================
    // ARRANQUE — esperar window.glMap
    // glMap se asigna en map.js dentro de initMap()
    // ================================================================
    let intentos = 0;
    const intervalo = setInterval(function () {
        intentos++;
        if (window.glMap) {
            clearInterval(intervalo);
            cargarTodo(window.glMap);
        } else if (intentos > 200) {
            clearInterval(intervalo);
            console.warn('[Vura OSM] window.glMap no disponible después de 20s');
        }
    }, 100);

    // API pública — ocultar/mostrar rutas OSM
    window.osmRoutesSetVisible = function (visible) {
        if (!window.glMap) return;
        DISTRITOS.forEach(function (d) {
            const layerId = 'osm-layer-' + d.nombre;
            if (window.glMap.getLayer(layerId)) {
                window.glMap.setLayoutProperty(
                    layerId, 'visibility', visible ? 'visible' : 'none'
                );
            }
        });
    };

})();
