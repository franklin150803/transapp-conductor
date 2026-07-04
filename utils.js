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

        // ==================== CONFIGURACIONES DE LA APP ====================
        window.saveAppSetting = function(key, value) {
            localStorage.setItem('vura_setting_' + key, JSON.stringify(value));
            if (key === 'batterySave') {
                window.applyBatterySaveSetting(value);
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

        window.applyBatterySaveSetting = function(enabled) {
            // Si el ahorro de batería está habilitado, podemos rebajar el renderizado
            // Esto sirve como interruptor lógico global para otras vistas
        };

        window.loadAppSettings = function() {
            const sosAlerts = window.getAppSetting('sosAlerts', true);
            const batterySave = window.getAppSetting('batterySave', false);
            const autoCenter = window.getAppSetting('autoCenter', true);
            
            const sosEl = document.getElementById('configSosAlerts');
            const batEl = document.getElementById('configBatterySave');
            const autoEl = document.getElementById('configAutoCenter');
            
            if (sosEl) sosEl.checked = sosAlerts;
            if (batEl) batEl.checked = batterySave;
            if (autoEl) autoEl.checked = autoCenter;
            
            window.applyBatterySaveSetting(batterySave);
        };
