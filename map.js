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
            // minZoom evita problemas de sincronizacion Leaflet/MapLibre en
            // niveles de zoom muy bajos (recomendado por la documentacion
            // oficial del plugin); Lima nunca se ve en zoom tan alejado.
            //
            // Parte 43: opciones de animacion mas fluida. zoomSnap/zoomDelta
            // chicos hacen que el zoom con gesto de pellizco se sienta
            // continuo en vez de saltar de golpe entre niveles enteros;
            // wheelPxPerZoomLevel suaviza el zoom con scroll en desktop.
            map = L.map('map', {
                zoomControl: true,
                attributionControl: true,
                minZoom: 3,
                zoomSnap: 0.5,
                zoomDelta: 0.5,
                wheelPxPerZoomLevel: 90,
                fadeAnimation: true,
                zoomAnimation: true,
                markerZoomAnimation: true
            }).setView([-12.0464, -77.0428], 12);

            // Parte 38: tiles vectoriales (MapLibre GL via el plugin
            // maplibre-gl-leaflet) en vez de imagenes PNG con filtro CSS.
            // El estilo en vura-map-style.json define colores, jerarquia de
            // vias y categorias (hospital, parque, etc) por separado, algo
            // que un filtro CSS sobre una imagen no puede lograr. Viene de
            // OpenFreeMap (datos de OpenStreetMap), sin cuenta ni API key.
            // Todo lo de abajo (marcadores, polylines, popups) sigue siendo
            // Leaflet normal: el plugin solo agrega esta capa base al mapa.
            //
            // Nota tecnica: el propio plugin deja el mapa de MapLibre sin
            // rotacion/inclinacion mientras esta dentro de Leaflet (Leaflet
            // maneja los gestos y sincroniza MapLibre por detras), asi que
            // no hace falta deshabilitarlas a mano. Esto tambien significa
            // que los edificios 3D con inclinacion de camara que se
            // planeaban para mas adelante no se ven "inclinados" aqui (se
            // ven en planta, como una sombra con volumen) — se ajusta el
            // plan de esa parte cuando se llegue.
            L.maplibreGL({
                style: 'vura-map-style.json',
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
        }

        // ==================== ROUTING REAL (ORS) ====================
        // OpenRouteService: gratis con registro, 2000 req/dia. Transforma
        // los puntos de control que el admin dibujo en el editor visual
        // (que ya son calles reales, no coordenadas al azar) en un trazado
        // exacto que abraza cada curva de cada avenida.
        //
        // INSTRUCCION UNICA: reemplaza 'TU_API_KEY_ORS' con la key que
        // obtienes gratis en https://openrouteservice.org/dev/#/signup
        // La key es una cadena de ~40 caracteres, empieza con "eyJ0..."
        const ORS_API_KEY = eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImZlNWIwMDczMGQ1ODQ2ZmZiNTJjYTkyY2Q2OTM0NzQyIiwiaCI6Im11cm11cjY0In0= ;
        const ORS_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car';

        // Cache en memoria (no hace falta persistir entre sesiones: las
        // rutas no cambian entre sesiones y ORS ya responde en <300ms).
        const routeCache = {};

        async function fetchOrsRoute(points) {
            // ORS necesita al menos 2 puntos y los recibe en [lng, lat]
            if (!points || points.length < 2) return null;
            if (ORS_API_KEY === 'TU_API_KEY_ORS') return null; // sin key, dibujar línea recta

            const key = points.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');
            if (routeCache[key]) return routeCache[key];

            try {
                const body = {
                    coordinates: points.map(p => [p[1], p[0]]) // [lng, lat]
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
                // ORS devuelve [lng, lat], Leaflet quiere [lat, lng]
                const latLngs = coords.map(c => [c[1], c[0]]);
                routeCache[key] = latLngs;
                return latLngs;
            } catch (e) {
                console.warn('ORS routing error:', e);
                return null;
            }
        }

        async function showRoute(companyId, company) {
            if (!company || !company.routePointsIda) return;

            if (routePolylines[companyId]) {
                if (routePolylines[companyId].ida) map.removeLayer(routePolylines[companyId].ida);
                if (routePolylines[companyId].retorno) map.removeLayer(routePolylines[companyId].retorno);
            }

            const isSelected = selectedCompanyId === companyId;
            const weight = isSelected ? 5 : 3;
            const opacity = isSelected ? 0.92 : 0.35;
            const dash = isSelected ? null : '10, 8';

            // Intenta obtener el trazado real sobre calles desde ORS;
            // si falla (sin key, sin internet, limite alcanzado), dibuja
            // los puntos de control directamente como polilinea — mucho
            // mejor que antes (que eran coordenadas al azar), ya que el
            // editor ahora los dibuja tocando calles reales.
            const idaPoints = await fetchOrsRoute(company.routePointsIda) || company.routePointsIda;
            const idaLine = L.polyline(idaPoints, {
                color: '#22d3ee',
                weight, opacity, dashArray: dash, smoothFactor: 1,
                className: 'route-line-ida'
            }).addTo(map);

            let retornoLine = null;
            if (company.routePointsRetorno && company.routePointsRetorno.length > 1) {
                const retPoints = await fetchOrsRoute(company.routePointsRetorno) || company.routePointsRetorno;
                retornoLine = L.polyline(retPoints, {
                    color: '#ff5252',
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

        // ==================== MODO ENFOQUE (Parte 46) ====================
        // Cuando el pasajero activa "Modo enfoque" sobre un vehiculo, el
        // resto del mapa (otros buses y rutas de otras empresas) se atenua
        // visualmente para que sea obvio cual es el bus que esta esperando,
        // sin necesidad de cerrar el panel ni perder el resto del contexto
        // del mapa (las otras rutas siguen ahi, solo mas tenues).
        let waitingTargetKey = null;

        // Aplica/retira las clases de atenuado sobre el DOM de un marcador
        // ya existente, sin tocar su icono ni su animacion de movimiento.
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

        // Define (o limpia, si key es null) cual vehiculo queda "enfocado".
        // Recorre los marcadores y polylines ya existentes para aplicar el
        // atenuado de inmediato, sin esperar a la proxima actualizacion de
        // posicion GPS (que podria tardar varios segundos en buses detenidos).
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
            // Cancela cualquier animacion previa de este marcador para evitar
            // que se acumulen varias animaciones compitiendo entre si.
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
                const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; // ease-in-out suave
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

                    // Si nada relevante cambio desde la ultima actualizacion de
                    // este vehiculo en particular, no recreamos su icono ni
                    // reiniciamos su animacion. Esto evita trabajo innecesario
                    // cuando hay muchos vehiculos y solo unos pocos se movieron.
                    const prevPos = vehicleLastKnownPos[markerId];
                    if (prevPos && prevPos.lat === live.lat && prevPos.lng === live.lng &&
                        prevPos.timestamp === live.timestamp) {
                        return;
                    }

                    // Si el conductor no envio heading nativo, lo calculamos
                    // comparando con la posicion previa que ya teniamos guardada.
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
                        // setIcon reconstruye el div del icono, asi que el
                        // atenuado de Modo enfoque hay que reaplicarlo cada
                        // vez (si no, "sobrevive" solo hasta el proximo GPS).
                        applyDimClass(vehicleMarkers[markerId], markerId);
                    } else {
                        // Parte 43: ya no se usa bindPopup aqui. Antes, al
                        // tocar el marcador, Leaflet abria el popup Y se
                        // disparaba el 'click' que abre el panel de detalle
                        // al mismo tiempo — el popup aparecia un instante y
                        // quedaba tapado de inmediato por el panel. El panel
                        // ya muestra toda esa informacion (y mas), asi que
                        // el popup era pura redundancia visual.
                        const marker = L.marker([live.lat, live.lng], {
                            icon: createVehicleIcon(sentidoColor, moving, plateLabel, heading)
                        }).addTo(map);

                        // Pequeño "pop" de entrada cuando aparece un vehiculo
                        // nuevo en el mapa, para que no se sienta que aparece
                        // de golpe sin transicion.
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


        // Estima minutos de llegada al destino de la ruta correspondiente
        // (ida o retorno, segun el sentido reportado por el conductor),
        // usando velocidad real si hay, o un promedio conservador de 18 km/h.
        function getActiveRoutePoints(company, live) {
            const sentido = (live && live.sentido) || 'ida';
            if (sentido === 'retorno' && company.routePointsRetorno && company.routePointsRetorno.length) {
                return company.routePointsRetorno;
            }
            return company.routePointsIda;
        }

        // Proyecta un punto (lat,lng) sobre un segmento de recta A-B y devuelve
        // el punto mas cercano sobre ese segmento, junto con que fraccion (0-1)
        // del segmento representa. Se usa para "pegar" la posicion del vehiculo
        // a la ruta real en vez de medir en linea recta hacia el destino.
        function projectPointOnSegment(lat, lng, aLat, aLng, bLat, bLng) {
            // Conversion simple a un plano local en metros, suficiente para
            // distancias cortas como las de una ruta urbana.
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

        // Calcula la distancia restante siguiendo la ruta real (no en linea
        // recta): encuentra el segmento de la polyline mas cercano al vehiculo,
        // se "pega" a ese punto, y suma la longitud de todos los segmentos
        // que quedan hasta el final de la ruta.
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

            // Si el vehiculo esta muy lejos de toda la ruta (>800m), el
            // "snapping" ya no es confiable; usamos linea recta al destino
            // como respaldo en vez de un numero engañosamente preciso.
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
                // Respaldo: linea recta al destino si el vehiculo esta
                // demasiado lejos de la ruta dibujada como para "pegarlo" a ella.
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

        // ==================== CONFIANZA DEL ETA (Parte 47) ====================
        // No es lo mismo "preciso" GPS (eso ya lo muestra gpsQuality, mide
        // la señal del telefono) que "confiable" el TIEMPO ESTIMADO: el
        // ETA puede tener buena señal GPS pero seguir siendo una mala
        // estimacion si el dato es viejo o si el vehiculo esta detenido
        // (en ese caso, estimateEtaMinutes usa un promedio de respaldo de
        // 18 km/h en vez de la velocidad real, porque no hay velocidad
        // real que usar). Combinamos 3 señales en un puntaje 0-5:
        //   - que tan reciente es el ultimo dato GPS (mas peso, porque un
        //     dato viejo invalida todo lo demas)
        //   - precision GPS del telefono del conductor
        //   - si el calculo uso velocidad real o el promedio de respaldo
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
