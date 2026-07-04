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
                zoomControl: false,
                attributionControl: true,
                minZoom: 3,
                zoomSnap: 0.5,
                zoomDelta: 0.5,
                wheelPxPerZoomLevel: 90,
                fadeAnimation: true,
                zoomAnimation: true,
                markerZoomAnimation: true
            }).setView([-12.0464, -77.0428], 12);

            L.maplibreGL({
                style: 'vura-map-style.json',
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }

        // ==================== ROUTING REAL (ORS) ====================
        const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImZlNWIwMDczMGQ1ODQ2ZmZiNTJjYTkyY2Q2OTM0NzQyIiwiaCI6Im11cm11cjY0In0=';
        const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car';

        const routeCache = {};

        async function fetchOrsRoute(points) {
            if (!points || points.length < 2) return null;
            if (ORS_API_KEY === 'TU_API_KEY_ORS') return null;

            const key = points.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
            if (routeCache[key]) return routeCache[key];

            try {
                const body = {
                    coordinates: points.map(p => [p[1], p[0]])
                };
                const res = await fetch(`${ORS_BASE}/geojson`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': ORS_API_KEY
                    },
                    body: JSON.stringify(body)
                });
                if (!res.ok) return null;
                const data = await res.json();
                const coords = data.features?.[0]?.geometry?.coordinates;
                if (!coords) return null;
                const latLngs = coords.map(c => [c[1], c[0]]);
                routeCache[key] = latLngs;
                return latLngs;
            } catch (e) {
                console.warn('ORS routing error:', e);
                return null;
            }
        }

        // ==================== MOSTRAR RUTAS (MODIFICADO) ====================
        // Ahora muestra rutas para TODAS las empresas (incluso no registradas)
        // pero los vehículos SOLO para empresas registradas (registered: true)
        async function showRoute(companyId, company) {
            if (!company || !company.routePointsIda) return;

            if (routePolylines[companyId]) {
                if (routePolylines[companyId].ida) map.removeLayer(routePolylines[companyId].ida);
                if (routePolylines[companyId].retorno) map.removeLayer(routePolylines[companyId].retorno);
            }

            const isSelected = selectedCompanyId === companyId;
            // Las empresas NO registradas se muestran con líneas más tenues
            const isRegistered = company.registered === true;
            const weight = isSelected ? 5 : (isRegistered ? 3 : 2);
            const opacity = isSelected ? 0.92 : (isRegistered ? 0.5 : 0.3);
            const dash = isSelected ? null : (isRegistered ? null : '10, 8');

            // Colores más limpios para las rutas
            const idaColor = isRegistered ? '#0ea5e9' : '#4a7a9c';
            const retornoColor = isRegistered ? '#ef4444' : '#9c4a4a';

            const idaPoints = await fetchOrsRoute(company.routePointsIda) || company.routePointsIda;
            const idaLine = L.polyline(idaPoints, {
                color: idaColor,
                weight, opacity, dashArray: dash, smoothFactor: 1,
                className: isRegistered ? 'route-line-ida' : 'route-line-ida-dim'
            }).addTo(map);

            let retornoLine = null;
            if (company.routePointsRetorno && company.routePointsRetorno.length > 1) {
                const retPoints = await fetchOrsRoute(company.routePointsRetorno) || company.routePointsRetorno;
                retornoLine = L.polyline(retPoints, {
                    color: retornoColor,
                    weight, opacity, dashArray: dash, smoothFactor: 1,
                    className: isRegistered ? 'route-line-retorno' : 'route-line-retorno-dim'
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
            const label = plate ? escapeHtml(String(plate)) : '';
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

        // ==================== MODO ENFOQUE ====================
        let waitingTargetKey = null;

        function applyDimClass(marker, markerId) {
            if (!marker) return;
            const el = marker.getElement && marker.getElement();
            if (!el) return;
            const wrap = el.querySelector('.vehicle-marker-wrap');
            if (!wrap) return;
            if (waitingTargetKey) {
                wrap.classList.toggle('vura-dimmed', markerId !== waitingTargetKey);
                wrap.classList.toggle('vura-waiting-target', markerId === waitingTargetKey);
            } else {
                wrap.classList.remove('vura-dimmed', 'vura-waiting-target');
            }
        }

        function setWaitingTarget(key) {
            waitingTargetKey = key;
            const targetCompanyId = key ? key.split('__')[0] : null;

            Object.keys(vehicleMarkers).forEach(markerId => applyDimClass(vehicleMarkers[markerId], markerId));

            Object.keys(routePolylines).forEach(companyId => {
                const entry = routePolylines[companyId];
                if (!entry) return;
                let opacity;
                if (targetCompanyId) {
                    opacity = (companyId === targetCompanyId) ? 0.9 : 0.08;
                } else {
                    opacity = (companyId === selectedCompanyId) ? 0.9 : 0.35;
                }
                if (entry.ida) entry.ida.setStyle({ opacity });
                if (entry.retorno) entry.retorno.setStyle({ opacity });
            });
        }

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

        // ==================== ACTUALIZAR MAPA CON DATOS EN VIVO (MODIFICADO) ====================
        // SOLO muestra vehículos para empresas REGISTRADAS (registered: true)
        function updateMapFromLiveData() {
            if (!map) return;
            Object.keys(companies).forEach(companyId => {
                const company = companies[companyId];
                if (!company.vehicles) return;

                // Si la empresa NO está registrada, NO mostramos vehículos
                if (company.registered !== true) return;

                Object.keys(company.vehicles).forEach(vehicleId => {
                    const vehicle = company.vehicles[vehicleId];
                    const live = (liveVehicles[companyId] || {})[vehicleId];
                    const markerId = vehicleKey(companyId, vehicleId);

                    if (!live || !isOnline(live)) {
                        removeVehicleMarker(markerId);
                        return;
                    }

                    const moving = (live.speed || 0) >= 3;
                    const sentidoColor = live.sentido === 'retorno' ? '#ef4444' : '#0ea5e9';
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
                        applyDimClass(vehicleMarkers[markerId], markerId);
                    } else {
                        const marker = L.marker([live.lat, live.lng], {
                            icon: createVehicleIcon(sentidoColor, moving, plateLabel, heading)
                        }).addTo(map);

                        const el = marker.getElement && marker.getElement();
                        if (el) {
                            el.style.opacity = '0';
                            el.style.transform += ' scale(0.5)';
                            requestAnimationFrame(() => {
                                el.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(.34,1.4,.64,1)';
                                el.style.opacity = '1';
                                el.style.transform = el.style.transform.replace('scale(0.5)', 'scale(1)');
                            });
                        }

                        marker.on('click', () => showVehiclePanel(companyId, vehicleId));
                        vehicleMarkers[markerId] = marker;
                        applyDimClass(marker, markerId);
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
        // ==================== PROYECCIÓN EN RUTA ====================
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

        // ==================== CONFIANZA DEL ETA ====================
        function estimateEtaConfidence(live) {
            if (!live || !live.timestamp) return null;

            const secsAgo = (Date.now() - live.timestamp) / 1000;
            const acc = live.accuracy;
            const usingRealSpeed = !!(live.speed && live.speed > 3);

            let score = 0;
            if (secsAgo <= 15) score += 2;
            else if (secsAgo <= 40) score += 1;

            if (acc !== null && acc !== undefined) {
                if (acc < 20) score += 2;
                else if (acc < 100) score += 1;
            }

            if (usingRealSpeed) score += 1;

            if (score >= 4) return { level: 'high', label: 'Preciso', dot: '🟢' };
            if (score >= 2) return { level: 'medium', label: 'Aproximado', dot: '🟡' };
            return { level: 'low', label: 'Poco confiable', dot: '🔴' };
        }

        // ==================== EMPRESA REGISTRADA? ====================
        // Función auxiliar para verificar si una empresa está registrada
        function isCompanyRegistered(companyId) {
            const company = companies[companyId];
            return company && company.registered === true;
        }

        // Función para obtener el badge de estado de la empresa
        function getCompanyStatusBadge(companyId) {
            const company = companies[companyId];
            if (!company) return '';
            if (company.registered === true) {
                return '<span class="company-status-badge registered">✅ Activa</span>';
            }
            return '<span class="company-status-badge unregistered">📋 Ruta disponible</span>';
        }
        // ==================== CALIDAD GPS ====================
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

        // ==================== EXPORTS GLOBALES ====================
        // Exponer funciones para que otros scripts las usen
        window.initMap = initMap;
        window.showRoute = showRoute;
        window.getRouteBoundsForCompany = getRouteBoundsForCompany;
        window.updateMapFromLiveData = updateMapFromLiveData;
        window.isOnline = isOnline;
        window.estimateEtaMinutes = estimateEtaMinutes;
        window.estimateDistanceKm = estimateDistanceKm;
        window.getActiveRoutePoints = getActiveRoutePoints;
        window.estimateEtaConfidence = estimateEtaConfidence;
        window.setWaitingTarget = setWaitingTarget;
        window.isCompanyRegistered = isCompanyRegistered;
        window.getCompanyStatusBadge = getCompanyStatusBadge;
        window.createVehicleIcon = createVehicleIcon;
        window.animateMarkerTo = animateMarkerTo;
        window.removeVehicleMarker = removeVehicleMarker;
        window.vehicleKey = vehicleKey;
