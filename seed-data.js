// seed-data.js
// Datos de ejemplo para la primera carga de Firebase
// Ahora usa RUTAS_LIMA desde rutas-lima.js

(function() {
    // Función para obtener los datos semilla
    function getSeedCompanies() {
        // Si RUTAS_LIMA está disponible, lo usamos
        if (typeof window !== 'undefined' && window.RUTAS_LIMA) {
            return window.RUTAS_LIMA;
        }
        
        // Fallback: usar datos de ejemplo mínimos por si algo falla
        return {
            "fallback_1": {
                name: "Empresa de Prueba",
                distrito: "Lima",
                route: "Ruta de Prueba",
                schedule: "8:00 AM - 6:00 PM",
                phone: "999999999",
                ruc: "20123456789",
                verified: false,
                registered: false,
                color: "#2563eb",
                destinos: ["Lima", "Callao"],
                routePointsIda: [
                    [-12.0200, -77.0100], [-12.0250, -77.0150], 
                    [-12.0300, -77.0200], [-12.0350, -77.0250], 
                    [-12.0400, -77.0300], [-12.0430, -77.0350],
                    [-12.0464, -77.0428]
                ],
                routePointsRetorno: [
                    [-12.0464, -77.0428], [-12.0440, -77.0360], 
                    [-12.0410, -77.0310], [-12.0360, -77.0260], 
                    [-12.0310, -77.0210], [-12.0260, -77.0160],
                    [-12.0200, -77.0100]
                ],
                vehicles: {}
            }
        };
    }

    // Exponer globalmente
    window.seedCompanies = getSeedCompanies();
})();
