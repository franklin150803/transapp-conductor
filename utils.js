// utils.js
// Funciones matemáticas/geograficas puras y compartidas por varios
// modulos (map.js, driver.js, passenger.js): distancia entre dos
// coordenadas (haversine), rumbo entre dos puntos (calculateBearing),
// y clasificacion de calidad de señal GPS (gpsQuality). No dependen de
// Firebase, del DOM ni de ninguna variable global de la app. Debe
// cargarse antes que map.js y antes del bloque de logica del conductor.

        function haversine(lat1, lon1, lat2, lon2) {
            const R = 6371000;
            const toRad = d => d * Math.PI / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        // Calcula el rumbo (0-360, 0 = norte) entre dos puntos consecutivos.
        // Se usa como respaldo cuando el GPS no entrega heading nativo confiable.
        function calculateBearing(lat1, lon1, lat2, lon2) {
            const toRad = d => d * Math.PI / 180;
            const toDeg = r => r * 180 / Math.PI;
            const dLon = toRad(lon2 - lon1);
            const y = Math.sin(dLon) * Math.cos(toRad(lat2));
            const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
            return (toDeg(Math.atan2(y, x)) + 360) % 360;
        }

        // Clasifica la precision del GPS (en metros) en una de 3 categorias
        // visuales, usadas tanto en la pantalla del conductor como en el
        // panel de detalle del pasajero. Mismos umbrales que ya se usaban
        // para el color de texto de precision, ahora centralizados aqui.
        function gpsQuality(accuracyMeters) {
            if (accuracyMeters === null || accuracyMeters === undefined) {
                return { level: 'unknown', label: 'Sin datos', dot: '⚪', cssClass: 'accuracy-unknown' };
            }
            if (accuracyMeters < 20) {
                return { level: 'good', label: 'GPS excelente', dot: '🟢', cssClass: 'accuracy-good' };
            }
            if (accuracyMeters < 100) {
                return { level: 'medium', label: 'Precisión media', dot: '🟡', cssClass: 'accuracy-medium' };
            }
            return { level: 'bad', label: 'Señal débil', dot: '🔴', cssClass: 'accuracy-bad' };
        }

        // ==================== RUTAS NATIVAS SOBRE EL MAPA 3D (MapLibre GL) ====================
        // El mapa base (pasajero y conductor) se renderiza en una escena WebGL
        // con pitch/bearing (vista 3D inclinada). Antes las rutas se dibujaban
        // con L.polyline de Leaflet, que vive en un pane 2D aparte y NO respeta
        // esa perspectiva: se veian como una calcomania flotando encima del
        // mapa en vez de una linea "pegada" al piso, sobre todo al rotar/
        // inclinar. La solucion: agregar la ruta como source+layer nativo de
        // MapLibre (misma escena 3D que calles y edificios).
        //
        // Nota: este mapa no tiene terreno real (DEM), el "pitch" es solo la
        // camara mirando de lado un plano, no hay eje Z de elevacion real. El
        // equivalente practico a "infinitamente cerca del mapa pero nunca
        // dentro" es el ORDEN de la capa dentro del estilo (ver beforeId mas
        // abajo): se inserta justo encima de calles/edificios y debajo de las
        // etiquetas, para no competir pixel a pixel con la capa de calles
        // (evita el parpadeo tipo z-fighting) y para no tapar los nombres de
        // calles/distritos. Si en el futuro se agrega terreno real (DEM), ahi
        // si tendria sentido un offset de elevacion real (line-translate).
        window.GL_ROUTE_LAYER_BEFORE_ID = 'boundary_2';

        // Espera a que el estilo del mapa (glMap) este listo antes de tocar
        // sources/layers. addLayer/addSource fallan si se llaman antes de que
        // el estilo termine de cargar.
        window.waitForGlMapReady = function(glMap, cb) {
            if (!glMap || typeof cb !== 'function') return;
            let done = false;
            const fire = () => {
                if (done) return;
                done = true;
                cb(glMap);
            };
            if (glMap.isStyleLoaded()) {
                fire();
                return;
            }
            glMap.once('load', fire);
            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                if (done || glMap.isStyleLoaded()) {
                    clearInterval(poll);
                    fire();
                    return;
                }
                if (attempts > 40) clearInterval(poll); // ~6s, nos rendimos en silencio
            }, 150);
        };

        // Crea (o actualiza si ya existe) un layer de linea nativo de MapLibre
        // a partir de un arreglo de puntos [lat, lng]. style: { color, weight,
        // opacity, dash }. Devuelve { sourceId, layerId, points } o null.
        window.upsertRouteLine = function(glMap, id, latLngPoints, style) {
            if (!glMap || !latLngPoints || latLngPoints.length < 2) return null;
            const sourceId = 'route-src-' + id;
            const layerId = 'route-line-' + id;
            const coordinates = latLngPoints.map(p => [p[1], p[0]]); // Leaflet [lat,lng] -> GeoJSON [lng,lat]
            const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} };
            const dashArray = (style && style.dash) ? style.dash : [1, 0]; // [1,0] = linea solida

            const existingSource = glMap.getSource(sourceId);
            if (existingSource) {
                existingSource.setData(geojson);
            } else {
                glMap.addSource(sourceId, { type: 'geojson', data: geojson });
            }

            if (!glMap.getLayer(layerId)) {
                const beforeId = glMap.getLayer(window.GL_ROUTE_LAYER_BEFORE_ID) ? window.GL_ROUTE_LAYER_BEFORE_ID : undefined;
                glMap.addLayer({
                    id: layerId,
                    type: 'line',
                    source: sourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': style.color,
                        'line-width': style.weight,
                        'line-opacity': style.opacity,
                        'line-dasharray': dashArray
                    }
                }, beforeId);
            } else {
                glMap.setPaintProperty(layerId, 'line-color', style.color);
                glMap.setPaintProperty(layerId, 'line-width', style.weight);
                glMap.setPaintProperty(layerId, 'line-opacity', style.opacity);
                glMap.setPaintProperty(layerId, 'line-dasharray', dashArray);
            }

            return { sourceId, layerId, points: latLngPoints };
        };

        // Quita un layer/source de ruta creado con upsertRouteLine (por
        // ejemplo cuando una empresa deja de tener retorno configurado).
        window.removeRouteLine = function(glMap, id) {
            if (!glMap) return;
            const sourceId = 'route-src-' + id;
            const layerId = 'route-line-' + id;
            if (glMap.getLayer(layerId)) glMap.removeLayer(layerId);
            if (glMap.getSource(sourceId)) glMap.removeSource(sourceId);
        };

        // ==================== CONFIGURACIONES DE LA APP ====================
        window.saveAppSetting = function(key, value) {
            localStorage.setItem('vura_setting_' + key, JSON.stringify(value));
            if (key === 'batterySave') {
                window.applyBatterySaveSetting(value);
            }
            if (key === 'largeText') {
                document.body.classList.toggle('large-text-mode', value);
            }
        };

        window.getAppSetting = function(key, defaultValue) {
            const val = localStorage.getItem('vura_setting_' + key);
            if (val === null) return defaultValue;
            try {
                return JSON.parse(val);
            } catch(e) {
                return defaultValue;
            }
        };

        window.playBeep = function() {
            if (!window.getAppSetting('soundAlerts', true)) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                gain.gain.setValueAtTime(0.04, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.08);
            } catch(e) {}
        };

        window.applyBatterySaveSetting = function(enabled) {
            if (window.glMap) {
                if (enabled) {
                    window.glMap.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
                } else {
                    window.glMap.easeTo({ pitch: 55, bearing: -10, duration: 1000 });
                }
            }
        };

        window.loadAppSettings = function() {
            const sosAlerts = window.getAppSetting('sosAlerts', true);
            const batterySave = window.getAppSetting('batterySave', false);
            const autoCenter = window.getAppSetting('autoCenter', true);
            const soundAlerts = window.getAppSetting('soundAlerts', true);
            const largeText = window.getAppSetting('largeText', false);
            const gpsInterval = window.getAppSetting('gpsInterval', '5');
            
            const sosEl = document.getElementById('configSosAlerts');
            const batEl = document.getElementById('configBatterySave');
            const autoEl = document.getElementById('configAutoCenter');
            const soundEl = document.getElementById('configSoundAlerts');
            const textEl = document.getElementById('configLargeText');
            const gpsEl = document.getElementById('configGpsInterval');
            
            if (sosEl) sosEl.checked = sosAlerts;
            if (batEl) batEl.checked = batterySave;
            if (autoEl) autoEl.checked = autoCenter;
            if (soundEl) soundEl.checked = soundAlerts;
            if (textEl) textEl.checked = largeText;
            if (gpsEl) gpsEl.value = gpsInterval;
            
            document.body.classList.toggle('large-text-mode', largeText);
            setTimeout(() => window.applyBatterySaveSetting(batterySave), 2000);
        };
