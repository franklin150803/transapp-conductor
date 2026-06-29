// utils.js
// Funciones matemáticas/geograficas puras y compartidas por varios
// modulos (map.js, driver.js, passenger.js): distancia entre dos
// coordenadas (haversine), rumbo entre dos puntos (calculateBearing),
// y clasificacion de calidad de señal GPS (gpsQuality). No dependen de
// Firebase, del DOM ni de ninguna variable global de la app. Debe
// cargarse antes que map.js y antes del bloque de logica del conductor.

        // Pre-compute constants for haversine formula
        const R = 6371000;
        const PI_OVER_180 = Math.PI / 180;
        const DEG_TO_RAD_CACHE = new Float64Array(361);
        const COS_CACHE = new Float64Array(361);
        const SIN_CACHE = new Float64Array(361);
        
        for (let i = 0; i <= 360; i++) {
            const rad = i * PI_OVER_180;
            DEG_TO_RAD_CACHE[i] = rad;
            COS_CACHE[i] = Math.cos(rad);
            SIN_CACHE[i] = Math.sin(rad);
        }

        function toRad(d) {
            // Use cache for common values, fallback to calculation
            const absD = Math.abs(d);
            if (absD <= 360 && Number.isInteger(absD)) {
                return d >= 0 ? DEG_TO_RAD_CACHE[absD] : -DEG_TO_RAD_CACHE[absD];
            }
            return d * PI_OVER_180;
        }

        // Cached trig functions for common angles
        function cosLat(lat) {
            const idx = Math.round(Math.abs(lat));
            if (idx <= 360) {
                return lat >= 0 ? COS_CACHE[idx] : COS_CACHE[idx];
            }
            return Math.cos(toRad(lat));
        }

        function sinLat(lat) {
            const idx = Math.round(Math.abs(lat));
            if (idx <= 360) {
                return lat >= 0 ? SIN_CACHE[idx] : -SIN_CACHE[idx];
            }
            return Math.sin(toRad(lat));
        }

        function haversine(lat1, lon1, lat2, lon2) {
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const cosLat1 = cosLat(lat1);
            const cosLat2 = cosLat(lat2);
            const sinHalfDLat = Math.sin(dLat * 0.5);
            const sinHalfDLon = Math.sin(dLon * 0.5);
            const a = sinHalfDLat * sinHalfDLat + cosLat1 * cosLat2 * sinHalfDLon * sinHalfDLon;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        // Calcula el rumbo (0-360, 0 = norte) entre dos puntos consecutivos.
        // Se usa como respaldo cuando el GPS no entrega heading nativo confiable.
        function calculateBearing(lat1, lon1, lat2, lon2) {
            const dLon = toRad(lon2 - lon1);
            const cosLat1 = cosLat(lat1);
            const sinLat2 = sinLat(lat2);
            const cosLat2 = cosLat(lat2);
            const sinLat1 = sinLat(lat1);
            const y = Math.sin(dLon) * cosLat2;
            const x = cosLat1 * sinLat2 - sinLat1 * cosLat2 * Math.cos(dLon);
            return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
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
