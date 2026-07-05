// osm-routes.js v2 — rutas OSM con Leaflet, mapa 2D

(function () {
    const BASE_URL = 'https://willowy-tiramisu-73a7ad.netlify.app/rutas/';

    const DISTRITOS = [
        { archivo: 'bellavista.geojson', nombre: 'Bellavista' },
        // { archivo: 'callao-cercado.geojson', nombre: 'Callao Cercado' },
        // { archivo: 'smp.geojson',            nombre: 'SMP'            },
    ];

    const COLOR_OSM   = '#2563eb';
    const OPACITY_OSM = 0.45;
    const WEIGHT_OSM  = 2;

    let osmLayers = [];
    let cargado   = false;

    function geojsonToLeafletLines(geojson) {
        const lineas = [];
        geojson.features.forEach(function (f) {
            if (!f.geometry) return;
            if (f.geometry.type === 'LineString') {
                const c = f.geometry.coordinates.map(p => [p[1], p[0]]);
                if (c.length >= 2) lineas.push(c);
            } else if (f.geometry.type === 'MultiLineString') {
                f.geometry.coordinates.forEach(function (seg) {
                    const c = seg.map(p => [p[1], p[0]]);
                    if (c.length >= 2) lineas.push(c);
                });
            }
        });
        return lineas;
    }

    async function cargarDistrito(lmap, distrito) {
        try {
            const res = await fetch(BASE_URL + distrito.archivo);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const geojson = await res.json();
            const lineas  = geojsonToLeafletLines(geojson);
            lineas.forEach(function (coords) {
                const pl = L.polyline(coords, {
                    color: COLOR_OSM,
                    weight: WEIGHT_OSM,
                    opacity: OPACITY_OSM,
                    smoothFactor: 1.5,
                    interactive: false,
                    className: 'osm-route-layer'
                }).addTo(lmap);
                pl.bringToBack();
                osmLayers.push(pl);
            });
            console.log('[Vura OSM] ' + distrito.nombre + ': ' + lineas.length + ' líneas');
        } catch (e) {
            console.warn('[Vura OSM] Error cargando ' + distrito.nombre + ':', e.message);
        }
    }

    async function cargarTodo(lmap) {
        if (cargado) return;
        cargado = true;
        await Promise.allSettled(DISTRITOS.map(d => cargarDistrito(lmap, d)));
        console.log('[Vura OSM] Total: ' + osmLayers.length + ' líneas en el mapa');
    }

    // Esperar window.map (expuesto desde passenger.js)
    let intentos = 0;
    const intervalo = setInterval(function () {
        intentos++;
        if (window.map && window.map.addLayer) {
            clearInterval(intervalo);
            cargarTodo(window.map);
        } else if (intentos > 200) {
            clearInterval(intervalo);
            console.warn('[Vura OSM] window.map no disponible después de 20s');
        }
    }, 100);

    window.osmRoutesCount = function () { return osmLayers.length; };
    window.osmRoutesSetVisible = function (visible) {
        osmLayers.forEach(function (pl) {
            if (!window.map) return;
            if (visible) pl.addTo(window.map);
            else window.map.removeLayer(pl);
        });
    };

})();
