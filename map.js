// map.js
// Mapa del pasajero: inicializacion de Leaflet, dibujo de rutas ida/retorno,
// marcadores de vehiculos con animacion e indicador de rumbo, calculo de
// ETA y distancia siguiendo la ruta real (no en linea recta).
// Depende de variables globales del script principal: map, companies,
// liveVehicles, vehicleMarkers, routePolylines, vehicleLastKnownPos,
// selectedCompanyId. Depende de haversine() y calculateBearing(), que
// viven en utils.js (debe cargarse antes que este archivo).

        // ==================== MAP (PASSENGER) ====================
        function initMap() {
            map = L.map('map', { 
                zoomControl: true, 
                attributionControl: true, 
                minZoom: 3,
                zoomSnap: 0.5, // Permite zoom en mitades (ej: 14.5) - Experiencia premium
                zoomDelta: 0.5, // Cuánto zoom hace cada scroll
                markerZoomAnimation: true // Anima los marcadores al hacer zoom
            }).setView([-12.0464, -77.0428], 12);

            // Mapa vectorial MapLibre GL con estilo propio de Vura
            L.maplibreGL({
                style: 'vura-map-style.json',
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }

        function showRoute(companyId, company) {
            if (!company || !company.routePointsIda) return;

            if (routePolylines[companyId]) {
                if (routePolylines[companyId].ida) map.removeLayer(routePolylines[companyId].ida);
                if (routePolylines[companyId].retorno) map.removeLayer(routePolylines[companyId].retorno);
            }

            const isSelected = selectedCompanyId === companyId;
            const weight = isSelected ? 5 : 3;
            const opacity = isSelected ? 0.9 : 0.35;
            const dash = isSelected ? null : '10, 8';

            const idaLine = L.polyline(company.routePointsIda, {
                color: '#22d3ee', // azul = ida (version neon, ver --ida-color)
                weight, opacity, dashArray: dash, smoothFactor: 1,
                className: 'route-line-ida'
            }).addTo(map);

            let retornoLine = null;
            if (company.routePointsRetorno && company.routePointsRetorno.length > 1) {
                retornoLine = L.polyline(company.routePointsRetorno, {
                    color: '#ff5252', // rojo = retorno (version neon, ver --retorno-color)
                    weight, opacity, dashArray: dash, smoothFactor: 1,
                    className: 'route-line-retorno'
                }).addTo(map);
            }

            routePolylines[companyId] = { ida: idaLine, retorno: retornoLine };
        }

        function getRouteBoundsForCompany(companyId) {
            const entry = routePolylines[companyId];
            if (!entry) return null;
            const points = [];
            if (entry.ida) points.push(...entry.ida.getLatLngs());
            if (entry.retorno) points.push(...entry.retorno.getLatLngs());
            return points.length ? L.latLngBounds(points) : null;
        }

        function createVehicleIcon(color, moving, plate, heading) {
            const label = plate ? String(plate) : '';
            const rotation = (typeof heading === 'number') ? heading : 0;
            return L.divIcon({
                className: 'vehicle-marker',
                html: `
                    <div class="vehicle-marker-wrap ${moving ? 'moving' : ''}">
                        <div class="vehicle-marker-label" style="border-color:${color}; color:${color};">${label}</div>
                        <div class="vehicle-marker-dot-wrap">
                            <div class="vehicle-marker-radar" style="background:${color};"></div>
                            <div class="vehicle-marker-dot" style="background:${color}; box-shadow: 0 0 8px ${color}, 0 0 3px rgba(0,0,0,0.5);">
                                <div class="vehicle-marker-arrow" style="transform: rotate(${rotation}deg); opacity:${moving ? 1 : 0};">▲</div>
                            </div>
                        </div>
                    </div>
                `,
                iconSize: [70, 46],
                iconAnchor: [35, 40]
            });
        }

        function vehicleKey(companyId, vehicleId) { return companyId + '__' + vehicleId; }

        function animateMarkerTo(marker, fromLatLng, toLatLng, durationMs) {
            if (marker._animFrame) {
                cancelAnimationFrame(marker._animFrame);
                marker._animFrame = null;
            }

            const start = performance.now();
            const fromLat = fromLatLng.lat, fromLng = fromLatLng.lng;
            const toLat = toLatLng[0], toLng = toLatLng[1];

            function step(now) {
                const elapsed = now - start;
                const t = Math.min(1, elapsed / durationMs);
                const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
                const lat = fromLat + (toLat - fromLat) * ease;
                const lng = fromLng + (toLng - fromLng) * ease;
                marker.setLatLng([lat, lng]);
                if (t < 1) {
                    marker._animFrame = requestAnimationFrame(step);
                } else {
                    marker._animFrame = null;
                }
            }
            marker._animFrame = requestAnimationFrame(step);
        }

        function updateMapFromLiveData() {
            if (!map) return;
            Object.keys(companies).forEach(companyId => {
                const company = companies[companyId];
                if (!company.vehicles) return;
                Object.keys(company.vehicles).forEach(vehicleId => {
                    const vehicle = company.vehicles[vehicleId];
                    const live = (liveVehicles[companyId] || {})[vehicleId];
                    const markerId = vehicleKey(companyId, vehicleId);

                    if (!live || !isOnline(live)) {
                        removeVehicleMarker(markerId);
                        return;
                    }

                    const moving = (live.speed || 0) >= 3;
                    const sentidoColor = live.sentido === 'retorno' ? '#ff5252' : '#22d3ee';
                    const sentidoLabel = live.sentido === 'retorno' ? 'Retorno' : 'Ida';
                    const plateLabel = vehicle.plate || vehicleId;

                    const prevPos = vehicleLastKnownPos[markerId];
                    if (prevPos && prevPos.lat === live.lat && prevPos.lng === live.lng &&
                        prevPos.timestamp === live.timestamp) {
                        return;
                    }

                    let heading = (typeof live.heading === 'number') ? live.heading : null;
                    if (heading === null && prevPos) {
                        const distM = haversine(prevPos.lat, prevPos.lng, live.lat, live.lng);
                        if (distM >= 5) heading = calculateBearing(prevPos.lat, prevPos.lng, live.lat, live.lng);
                        else heading = prevPos.heading;
                    }

                    if (vehicleMarkers[markerId]) {
                        const fromLatLng = vehicleMarkers[markerId].getLatLng();
                        animateMarkerTo(vehicleMarkers[markerId], fromLatLng, [live.lat, live.lng], 2500);
                        vehicleMarkers[markerId].setIcon(createVehicleIcon(sentidoColor, moving, plateLabel, heading));
                    } else {
                        const marker = L.marker([live.lat, live.lng], {
                            icon: createVehicleIcon(sentidoColor, moving, plateLabel, heading)
                        }).addTo(map);

                        marker.bindPopup(`
                            <div class="popup-title">${appIcon('bus', 14)} ${escapeHtml(vehicle.plate || vehicleId)}</div>
                            <div class="popup-info">Empresa: ${escapeHtml(company.name)}</div>
                            <div class="popup-info">Sentido: ${sentidoLabel}</div>
                            <div class="popup-info">Velocidad: ${Math.round(live.speed || 0)} km/h</div>
                            <div class="popup-badge">✓ Empresa Verificada</div>
                        `);

                        marker.on('click', () => showVehiclePanel(companyId, vehicleId));
                        vehicleMarkers[markerId] = marker;
                    }

                    vehicleLastKnownPos[markerId] = { lat: live.lat, lng: live.lng, heading, timestamp: live.timestamp };
                });
            });
        }

        function removeVehicleMarker(markerId) {
            if (vehicleMarkers[markerId]) {
                if (vehicleMarkers[markerId]._animFrame) {
                    cancelAnimationFrame(vehicleMarkers[markerId]._animFrame);
                }
                map.removeLayer(vehicleMarkers[markerId]);
                delete vehicleMarkers[markerId];
                delete vehicleLastKnownPos[markerId];
            }
        }

        function isOnline(live) {
            if (!live || !live.timestamp) return false;
            return (Date.now() - live.timestamp) < 60000;
        }

        function getActiveRoutePoints(company, live) {
            const sentido = (live && live.sentido) || 'ida';
            if (sentido === 'retorno' && company.routePointsRetorno && company.routePointsRetorno.length) {
                return company.routePointsRetorno;
            }
            return company.routePointsIda;
        }

        function projectPointOnSegment(lat, lng, aLat, aLng, bLat, bLng) {
            const toXY = (la, ln) => ({
                x: (ln - aLng) * 111320 * Math.cos(aLat * Math.PI / 180),
                y: (la - aLat) * 110540
            });
            const p = toXY(lat, lng);
            const a = { x: 0, y: 0 };
            const b = toXY(bLat, bLng);

            const abx = b.x - a.x, aby = b.y - a.y;
            const lenSq = abx * abx + aby * aby;
            let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
            t = Math.max(0, Math.min(1, t));

            const projLat = aLat + (bLat - aLat) * t;
            const projLng = aLng + (bLng - aLng) * t;
            const distToSegment = haversine(lat, lng, projLat, projLng);

            return { lat: projLat, lng: projLng, t, distToSegment };
        }

        function distanceAlongRoute(points, lat, lng) {
            if (!points || points.length < 2) return null;

            let bestSegmentIdx = 0;
            let bestDist = Infinity;
            let bestProjection = null;

            for (let i = 0; i < points.length - 1; i++) {
                const [aLat, aLng] = points[i];
                const [bLat, bLng] = points[i + 1];
                const proj = projectPointOnSegment(lat, lng, aLat, aLng, bLat, bLng);
                if (proj.distToSegment < bestDist) {
                    bestDist = proj.distToSegment;
                    bestSegmentIdx = i;
                    bestProjection = proj;
                }
            }

            if (bestDist > 800) return null;

            let remaining = haversine(
                bestProjection.lat, bestProjection.lng,
                points[bestSegmentIdx + 1][0], points[bestSegmentIdx + 1][1]
            );
            for (let i = bestSegmentIdx + 1; i < points.length - 1; i++) {
                remaining += haversine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
            }
            return remaining;
        }

        function estimateEtaMinutes(company, live) {
            const points = getActiveRoutePoints(company, live);
            if (!points || points.length === 0) return null;

            let distM = distanceAlongRoute(points, live.lat, live.lng);
            if (distM === null) {
                const dest = points[points.length - 1];
                distM = haversine(live.lat, live.lng, dest[0], dest[1]);
            }

            const speedKmh = (live.speed && live.speed > 3) ? live.speed : 18;
            const speedMs = speedKmh / 3.6;
            if (speedMs <= 0) return null;
            return Math.max(1, Math.round((distM / speedMs) / 60));
        }

        function estimateDistanceKm(company, live) {
            const points = getActiveRoutePoints(company, live);
            if (!points || points.length === 0) return null;

            let distM = distanceAlongRoute(points, live.lat, live.lng);
            if (distM === null) {
                const dest = points[points.length - 1];
                distM = haversine(live.lat, live.lng, dest[0], dest[1]);
            }
            return distM / 1000;
        }
