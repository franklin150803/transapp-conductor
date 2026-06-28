// seed-data.js
// Datos de ejemplo (3 empresas de prueba con rutas ida/retorno y
// vehiculos) que se usan unicamente la primera vez que la base de datos
// de Firebase esta vacia (ver seedIfEmpty() en el script principal).
// No contiene logica de la app, solo datos.

        // ==================== SEED DATA (solo si Firebase esta vacio) ====================
        const seedCompanies = {
            empresa001: {
                name: "Empresa Los Incas",
                ruc: "20512345678",
                route: "San Juan de Lurigancho → Centro de Lima",
                schedule: "5:00 AM - 10:00 PM",
                phone: "987654321",
                verified: true,
                color: "#0d9488",
                routePointsIda: [
                    [-12.0200, -77.0100], [-12.0250, -77.0150], [-12.0300, -77.0200],
                    [-12.0350, -77.0250], [-12.0400, -77.0300], [-12.0430, -77.0350],
                    [-12.0464, -77.0428]
                ],
                routePointsRetorno: [
                    [-12.0464, -77.0428], [-12.0440, -77.0360], [-12.0410, -77.0310],
                    [-12.0360, -77.0260], [-12.0310, -77.0210], [-12.0260, -77.0160],
                    [-12.0200, -77.0100]
                ],
                vehicles: {
                    vehiculo01: { plate: "ABC-123", driver: "Sin asignar" },
                    vehiculo02: { plate: "DEF-456", driver: "Sin asignar" }
                }
            },
            empresa002: {
                name: "Transportes El Sol",
                ruc: "20598765432",
                route: "Villa El Salvador → Miraflores",
                schedule: "5:30 AM - 11:00 PM",
                phone: "912345678",
                verified: true,
                color: "#f59e0b",
                routePointsIda: [
                    [-12.1900, -76.9500], [-12.1700, -76.9600], [-12.1500, -76.9700],
                    [-12.1300, -76.9800], [-12.1100, -76.9900], [-12.0900, -77.0100],
                    [-12.0750, -77.0270]
                ],
                routePointsRetorno: [
                    [-12.0750, -77.0270], [-12.0920, -77.0080], [-12.1120, -76.9880],
                    [-12.1320, -76.9780], [-12.1520, -76.9680], [-12.1720, -76.9580],
                    [-12.1900, -76.9500]
                ],
                vehicles: {
                    vehiculo01: { plate: "GHI-789", driver: "Sin asignar" },
                    vehiculo02: { plate: "JKL-012", driver: "Sin asignar" }
                }
            },
            empresa003: {
                name: "Lima Express S.A.C.",
                ruc: "20611223344",
                route: "Comas → Barranco",
                schedule: "4:30 AM - 9:30 PM",
                phone: "955667788",
                verified: true,
                color: "#6366f1",
                routePointsIda: [
                    [-11.9200, -77.0600], [-11.9400, -77.0550], [-11.9600, -77.0500],
                    [-11.9800, -77.0450], [-12.0000, -77.0400], [-12.0200, -77.0350],
                    [-12.0400, -77.0300], [-12.0600, -77.0280], [-12.0800, -77.0250],
                    [-12.1000, -77.0220]
                ],
                routePointsRetorno: [
                    [-12.1000, -77.0220], [-12.0820, -77.0270], [-12.0620, -77.0300],
                    [-12.0420, -77.0320], [-12.0220, -77.0370], [-12.0020, -77.0420],
                    [-11.9820, -77.0470], [-11.9620, -77.0520], [-11.9420, -77.0570],
                    [-11.9200, -77.0600]
                ],
                vehicles: {
                    vehiculo01: { plate: "MNO-345", driver: "Sin asignar" },
                    vehiculo02: { plate: "PQR-678", driver: "Sin asignar" }
                }
            }
        };
