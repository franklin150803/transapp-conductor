// utils.js
// Funciones matemáticas/geograficas puras y compartidas por varios
// modulos (map.js, driver.js): distancia entre dos coordenadas (haversine)
// y rumbo entre dos puntos (calculateBearing). No dependen de Firebase,
// del DOM ni de ninguna variable global de la app. Debe cargarse antes
// que map.js y antes que el bloque de logica del conductor.

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
