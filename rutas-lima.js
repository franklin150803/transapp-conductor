// rutas-lima.js
// Base de datos de rutas de transporte público para Lima y Callao
// Cada ruta contiene: nombre, distrito, coordenadas de ida y retorno
// registered: false = solo muestra la ruta (líneas azul/rojo)
// registered: true = muestra ruta + vehículos + información completa

(function() {
    const RUTAS_LIMA = {
        // ============================================================
        // DISTRITO: SAN JUAN DE LURIGANCHO
        // ============================================================
        "sanjuan_1": {
            name: "Transportes San Juan S.A.",
            distrito: "San Juan de Lurigancho",
            route: "San Juan de Lurigancho → Centro de Lima",
            schedule: "5:00 AM - 10:00 PM",
            phone: "987654321",
            ruc: "20512345678",
            verified: false,
            registered: false,
            color: "#0ea5e9",
            destinos: ["Universidad Nacional", "Plaza Norte", "Hospital Rebagliati"],
            routePointsIda: [
                [-12.0200, -77.0100], // Av. Próceres - Canto Grande
                [-12.0235, -77.0140], // Av. Canto Grande
                [-12.0270, -77.0180], // Av. Los Jardines
                [-12.0320, -77.0220], // Av. Abancay
                [-12.0370, -77.0260], // Av. Abancay
                [-12.0420, -77.0300], // Av. Abancay
                [-12.0464, -77.0428]  // Centro de Lima
            ],
            routePointsRetorno: [
                [-12.0464, -77.0428], // Centro de Lima
                [-12.0430, -77.0360], // Av. Abancay
                [-12.0380, -77.0310], // Av. Abancay
                [-12.0330, -77.0270], // Av. Abancay
                [-12.0280, -77.0230], // Av. Los Jardines
                [-12.0240, -77.0170], // Av. Canto Grande
                [-12.0200, -77.0100]  // Av. Próceres - Canto Grande
            ],
            vehicles: {}
        },
        "sanjuan_2": {
            name: "Los Incas Express",
            distrito: "San Juan de Lurigancho",
            route: "San Juan de Lurigancho → San Miguel",
            schedule: "5:30 AM - 10:30 PM",
            phone: "912345678",
            ruc: "20598765432",
            verified: false,
            registered: false,
            color: "#8b5cf6",
            destinos: ["Zárate", "Los Jardines", "Universitaria", "La Marina"],
            routePointsIda: [
                [-12.0150, -77.0080], // Av. Zárate
                [-12.0180, -77.0120], // Av. Los Jardines
                [-12.0250, -77.0200], // Av. Universitaria
                [-12.0320, -77.0280], // Av. Universitaria
                [-12.0400, -77.0350], // Av. La Marina
                [-12.0450, -77.0400], // Av. La Marina
                [-12.0500, -77.0450]  // San Miguel
            ],
            routePointsRetorno: [
                [-12.0500, -77.0450], // San Miguel
                [-12.0450, -77.0400], // Av. La Marina
                [-12.0400, -77.0350], // Av. La Marina
                [-12.0320, -77.0280], // Av. Universitaria
                [-12.0250, -77.0200], // Av. Universitaria
                [-12.0180, -77.0120], // Av. Los Jardines
                [-12.0150, -77.0080]  // Av. Zárate
            ],
            vehicles: {}
        },
        "sanjuan_3": {
            name: "Metropolitano SJL",
            distrito: "San Juan de Lurigancho",
            route: "San Juan de Lurigancho → Miraflores",
            schedule: "5:00 AM - 11:00 PM",
            phone: "998877665",
            ruc: "20611223344",
            verified: false,
            registered: false,
            color: "#f59e0b",
            destinos: ["Canto Grande", "Acho", "Plaza de Armas", "Larco"],
            routePointsIda: [
                [-12.0220, -77.0050], // Canto Grande
                [-12.0280, -77.0120], // Av. Acho
                [-12.0350, -77.0200], // Av. Abancay
                [-12.0400, -77.0280], // Av. Grau
                [-12.0450, -77.0350], // Av. Pardo
                [-12.0500, -77.0400], // Av. Larco
                [-12.0550, -77.0450]  // Miraflores
            ],
            routePointsRetorno: [
                [-12.0550, -77.0450], // Miraflores
                [-12.0500, -77.0400], // Av. Larco
                [-12.0450, -77.0350], // Av. Pardo
                [-12.0400, -77.0280], // Av. Grau
                [-12.0350, -77.0200], // Av. Abancay
                [-12.0280, -77.0120], // Av. Acho
                [-12.0220, -77.0050]  // Canto Grande
            ],
            vehicles: {}
        },

        // ============================================================
        // DISTRITO: VILLA EL SALVADOR
        // ============================================================
        "villa_1": {
            name: "Villa Bus S.A.",
            distrito: "Villa El Salvador",
            route: "Villa El Salvador → Miraflores",
            schedule: "5:30 AM - 10:00 PM",
            phone: "987654321",
            ruc: "20765432198",
            verified: false,
            registered: false,
            color: "#10b981",
            destinos: ["Pachacútec", "Separadora Industrial", "Larco"],
            routePointsIda: [
                [-12.1900, -76.9500], // Av. Pachacútec
                [-12.1750, -76.9600], // Av. Separadora Industrial
                [-12.1600, -76.9700], // Av. Separadora Industrial
                [-12.1450, -76.9800], // Av. Caminos del Inca
                [-12.1300, -76.9900], // Av. Caminos del Inca
                [-12.1150, -77.0000], // Av. Larco
                [-12.1000, -77.0100], // Miraflores
                [-12.0900, -77.0200]  // Miraflores
            ],
            routePointsRetorno: [
                [-12.0900, -77.0200], // Miraflores
                [-12.1050, -77.0100], // Av. Larco
                [-12.1200, -76.9980], // Av. Caminos del Inca
                [-12.1350, -76.9850], // Av. Caminos del Inca
                [-12.1500, -76.9750], // Av. Separadora Industrial
                [-12.1650, -76.9650], // Av. Separadora Industrial
                [-12.1800, -76.9550], // Av. Pachacútec
                [-12.1900, -76.9500]  // Av. Pachacútec
            ],
            vehicles: {}
        },
        "villa_2": {
            name: "El Sol Transportes",
            distrito: "Villa El Salvador",
            route: "Villa El Salvador → San Isidro",
            schedule: "5:00 AM - 11:00 PM",
            phone: "912345678",
            ruc: "20876543219",
            verified: false,
            registered: false,
            color: "#ef4444",
            destinos: ["Revolución", "Caminos del Inca", "Javier Prado"],
            routePointsIda: [
                [-12.1950, -76.9450], // Av. Revolución
                [-12.1800, -76.9550], // Av. Revolución
                [-12.1650, -76.9650], // Av. Caminos del Inca
                [-12.1500, -76.9750], // Av. Caminos del Inca
                [-12.1350, -76.9850], // Av. Javier Prado
                [-12.1200, -76.9950], // Av. Javier Prado
                [-12.1050, -77.0050], // San Isidro
                [-12.0950, -77.0150]  // San Isidro
            ],
            routePointsRetorno: [
                [-12.0950, -77.0150], // San Isidro
                [-12.1100, -77.0050], // Av. Javier Prado
                [-12.1250, -76.9950], // Av. Javier Prado
                [-12.1400, -76.9850], // Av. Caminos del Inca
                [-12.1550, -76.9750], // Av. Caminos del Inca
                [-12.1700, -76.9650], // Av. Revolución
                [-12.1850, -76.9550], // Av. Revolución
                [-12.1950, -76.9450]  // Av. Revolución
            ],
            vehicles: {}
        },

        // ============================================================
        // DISTRITO: COMAS
        // ============================================================
        "comas_1": {
            name: "Comas Express",
            distrito: "Comas",
            route: "Comas → Barranco",
            schedule: "4:30 AM - 9:30 PM",
            phone: "987654321",
            ruc: "20987654321",
            verified: false,
            registered: false,
            color: "#8b5cf6",
            destinos: ["Túpac Amaru", "Universitaria", "Pedro de Osma"],
            routePointsIda: [
                [-11.9200, -77.0600], // Av. Túpac Amaru
                [-11.9400, -77.0550], // Av. Túpac Amaru
                [-11.9600, -77.0500], // Av. Universitaria
                [-11.9800, -77.0450], // Av. Universitaria
                [-12.0000, -77.0400], // Av. Universitaria
                [-12.0200, -77.0350], // Av. Pedro de Osma
                [-12.0400, -77.0300], // Barranco
                [-12.0600, -77.0280], // Barranco
                [-12.0800, -77.0250]  // Barranco
            ],
            routePointsRetorno: [
                [-12.0800, -77.0250], // Barranco
                [-12.0600, -77.0300], // Barranco
                [-12.0400, -77.0320], // Av. Pedro de Osma
                [-12.0200, -77.0370], // Av. Universitaria
                [-12.0000, -77.0420], // Av. Universitaria
                [-11.9800, -77.0470], // Av. Universitaria
                [-11.9600, -77.0520], // Av. Túpac Amaru
                [-11.9400, -77.0570], // Av. Túpac Amaru
                [-11.9200, -77.0600]  // Av. Túpac Amaru
            ],
            vehicles: {}
        },
        "comas_2": {
            name: "Transportes del Norte",
            distrito: "Comas",
            route: "Comas → Callao",
            schedule: "5:00 AM - 10:00 PM",
            phone: "912345678",
            ruc: "20123456789",
            verified: false,
            registered: false,
            color: "#f59e0b",
            destinos: ["Túpac Amaru", "Colonial", "Faucett"],
            routePointsIda: [
                [-11.9250, -77.0580], // Av. Túpac Amaru
                [-11.9450, -77.0530], // Av. Túpac Amaru
                [-11.9650, -77.0480], // Av. Colonial
                [-11.9850, -77.0430], // Av. Colonial
                [-12.0050, -77.0380], // Av. Colonial
                [-12.0250, -77.0330], // Av. Faucett
                [-12.0450, -77.0300], // Callao
                [-12.0650, -77.0280]  // Callao
            ],
            routePointsRetorno: [
                [-12.0650, -77.0280], // Callao
                [-12.0450, -77.0320], // Av. Faucett
                [-12.0250, -77.0370], // Av. Colonial
                [-12.0050, -77.0420], // Av. Colonial
                [-11.9850, -77.0470], // Av. Colonial
                [-11.9650, -77.0520], // Av. Túpac Amaru
                [-11.9450, -77.0570], // Av. Túpac Amaru
                [-11.9250, -77.0580]  // Av. Túpac Amaru
            ],
            vehicles: {}
        },

        // ============================================================
        // DISTRITO: CALLAO
        // ============================================================
        "callao_1": {
            name: "Callao Transport",
            distrito: "Callao",
            route: "Callao → Lima Centro",
            schedule: "5:30 AM - 10:30 PM",
            phone: "987654321",
            ruc: "20567891234",
            verified: false,
            registered: false,
            color: "#0ea5e9",
            destinos: ["Colonial", "Argentina", "Abancay"],
            routePointsIda: [
                [-12.0700, -77.0250], // Callao
                [-12.0600, -77.0300], // Av. Colonial
                [-12.0500, -77.0350], // Av. Colonial
                [-12.0400, -77.0400], // Av. Argentina
                [-12.0350, -77.0450], // Av. Argentina
                [-12.0300, -77.0500], // Av. Abancay
                [-12.0250, -77.0550], // Lima Centro
                [-12.0200, -77.0600]  // Lima Centro
            ],
            routePointsRetorno: [
                [-12.0200, -77.0600], // Lima Centro
                [-12.0250, -77.0550], // Av. Abancay
                [-12.0300, -77.0500], // Av. Argentina
                [-12.0350, -77.0450], // Av. Argentina
                [-12.0400, -77.0400], // Av. Colonial
                [-12.0500, -77.0350], // Av. Colonial
                [-12.0600, -77.0300], // Av. Colonial
                [-12.0700, -77.0250]  // Callao
            ],
            vehicles: {}
        },
        "callao_2": {
            name: "Puerto Express",
            distrito: "Callao",
            route: "Callao → San Miguel",
            schedule: "5:00 AM - 11:00 PM",
            phone: "912345678",
            ruc: "20678912345",
            verified: false,
            registered: false,
            color: "#10b981",
            destinos: ["La Marina", "Universitaria", "Elmer Faucett"],
            routePointsIda: [
                [-12.0750, -77.0220], // Callao
                [-12.0650, -77.0250], // Av. Elmer Faucett
                [-12.0550, -77.0300], // Av. La Marina
                [-12.0450, -77.0350], // Av. La Marina
                [-12.0350, -77.0400], // Av. Universitaria
                [-12.0250, -77.0450], // Av. Universitaria
                [-12.0150, -77.0500], // San Miguel
                [-12.0100, -77.0550]  // San Miguel
            ],
            routePointsRetorno: [
                [-12.0100, -77.0550], // San Miguel
                [-12.0150, -77.0500], // Av. Universitaria
                [-12.0250, -77.0450], // Av. Universitaria
                [-12.0350, -77.0400], // Av. La Marina
                [-12.0450, -77.0350], // Av. La Marina
                [-12.0550, -77.0300], // Av. Elmer Faucett
                [-12.0650, -77.0250], // Av. Elmer Faucett
                [-12.0750, -77.0220]  // Callao
            ],
            vehicles: {}
        },

        // ============================================================
        // DISTRITO: SAN MARTÍN DE PORRES
        // ============================================================
        "smp_1": {
            name: "SMP Transport",
            distrito: "San Martín de Porres",
            route: "San Martín de Porres → Lima Centro",
            schedule: "5:00 AM - 10:00 PM",
            phone: "987654321",
            ruc: "20789123456",
            verified: false,
            registered: false,
            color: "#ef4444",
            destinos: ["Túpac Amaru", "Colonial", "Abancay"],
            routePointsIda: [
                [-11.9500, -77.0500], // SMP
                [-11.9650, -77.0450], // Av. Túpac Amaru
                [-11.9800, -77.0400], // Av. Túpac Amaru
                [-11.9950, -77.0350], // Av. Colonial
                [-12.0100, -77.0300], // Av. Colonial
                [-12.0250, -77.0350], // Av. Abancay
                [-12.0350, -77.0400], // Lima Centro
                [-12.0450, -77.0450]  // Lima Centro
            ],
            routePointsRetorno: [
                [-12.0450, -77.0450], // Lima Centro
                [-12.0350, -77.0400], // Av. Abancay
                [-12.0250, -77.0350], // Av. Colonial
                [-12.0100, -77.0300], // Av. Colonial
                [-11.9950, -77.0350], // Av. Túpac Amaru
                [-11.9800, -77.0400], // Av. Túpac Amaru
                [-11.9650, -77.0450], // Av. Túpac Amaru
                [-11.9500, -77.0500]  // SMP
            ],
            vehicles: {}
        },

        // ============================================================
        // DISTRITO: LOS OLIVOS
        // ============================================================
        "olivos_1": {
            name: "Olivos Express",
            distrito: "Los Olivos",
            route: "Los Olivos → San Isidro",
            schedule: "5:30 AM - 10:30 PM",
            phone: "912345678",
            ruc: "20891234567",
            verified: false,
            registered: false,
            color: "#8b5cf6",
            destinos: ["Túpac Amaru", "Universitaria", "Javier Prado"],
            routePointsIda: [
                [-11.9300, -77.0550], // Los Olivos
                [-11.9450, -77.0500], // Av. Túpac Amaru
                [-11.9600, -77.0450], // Av. Túpac Amaru
                [-11.9750, -77.0400], // Av. Universitaria
                [-11.9900, -77.0350], // Av. Universitaria
                [-12.0050, -77.0300], // Av. Javier Prado
                [-12.0200, -77.0250], // Av. Javier Prado
                [-12.0350, -77.0200], // San Isidro
                [-12.0500, -77.0150]  // San Isidro
            ],
            routePointsRetorno: [
                [-12.0500, -77.0150], // San Isidro
                [-12.0350, -77.0200], // Av. Javier Prado
                [-12.0200, -77.0250], // Av. Javier Prado
                [-12.0050, -77.0300], // Av. Universitaria
                [-11.9900, -77.0350], // Av. Universitaria
                [-11.9750, -77.0400], // Av. Túpac Amaru
                [-11.9600, -77.0450], // Av. Túpac Amaru
                [-11.9450, -77.0500], // Av. Túpac Amaru
                [-11.9300, -77.0550]  // Los Olivos
            ],
            vehicles: {}
        }
    };

    // Exponer globalmente para que otros scripts lo usen
    window.RUTAS_LIMA = RUTAS_LIMA;
})();
