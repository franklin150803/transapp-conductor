// driver.js
// Vista del conductor: motor real de GPS (watchPosition), calculo de
// velocidad y rumbo, seleccion de sentido (ida/retorno), envio de
// ubicacion a Firebase, y flujo de iniciar/finalizar recorrido con
// confirmacion. Depende de variables globales del script principal
// (activeDriverPath, watchId, driverMap, driverMarker, packetsSent,
// currentDriverSentido, companies) y de funciones de utils.js
// (haversine) y map.js (createVehicleIcon). Debe cargarse antes del
// script principal.

        // Estado del recorrido actual, usado para construir el registro
        // de historial cuando el conductor finaliza (ver stopDriverMode).
        let currentTripStartTime = null;
        let currentTripDistanceM = 0;
        let currentTripLastPos = null;

        // Marca de tiempo del ultimo envio real a Firebase, usada por el
        // throttle adaptativo (Parte 25): no todas las lecturas de GPS se
        // suben a la base de datos, para ahorrar bateria y datos moviles.
        let lastFirebaseSendTime = 0;

        // Parte 37: nivel de ocupacion reportado a mano por el conductor.
        // Viaja en cada escritura a Firebase (igual que lat/lng), para que
        // no se pierda entre una lectura de GPS y la siguiente.
        let currentOccupancy = null;

        // Aviso de "pasajero esperando" (Parte 26): listener activo y
        // registro de avisos ya notificados, para no repetir sonido/log
        // por un mismo aviso que ya vimos.
        let waitingListenerUnsub = null;
        let knownWaitingIds = {};

        // ==================== DRIVER VIEW (GPS REAL) ====================
        function populateDriverSelects() {
            const companySelect = document.getElementById('driverCompany');
            const prevCompany = companySelect.value;
            companySelect.innerHTML = '';
            Object.keys(companies).forEach(companyId => {
                const opt = document.createElement('option');
                opt.value = companyId;
                opt.textContent = companies[companyId].name;
                companySelect.appendChild(opt);
            });
            if (prevCompany && companies[prevCompany]) companySelect.value = prevCompany;
            populateDriverVehicleSelect();
        }

        function populateDriverVehicleSelect() {
            const companyId = document.getElementById('driverCompany').value;
            const vehicleSelect = document.getElementById('driverVehicle');
            vehicleSelect.innerHTML = '';
            const company = companies[companyId];
            if (!company || !company.vehicles) return;
            Object.keys(company.vehicles).forEach(vehicleId => {
                const opt = document.createElement('option');
                opt.value = vehicleId;
                opt.textContent = company.vehicles[vehicleId].plate || vehicleId;
                vehicleSelect.appendChild(opt);
            });
        }

        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'driverCompany') populateDriverVehicleSelect();
        });

        function addLog(message) {
            const consoleEl = document.getElementById('logConsole');
            const time = new Date().toLocaleTimeString('es-PE');
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.textContent = `[${time}] ${message}`;
            consoleEl.insertBefore(entry, consoleEl.firstChild);
        }

        function setDriverStatus(cls, text) {
            const badge = document.getElementById('driverStatusBadge');
            badge.className = 'status-badge ' + cls;
            document.getElementById('driverStatusText').textContent = text;
        }

        function setDriverSentido(sentido) {
            currentDriverSentido = sentido;
            document.getElementById('sentidoIdaBtn').classList.toggle('active', sentido === 'ida');
            document.getElementById('sentidoRetornoBtn').classList.toggle('active', sentido === 'retorno');
        }

        function updateSentidoActiveBadge() {
            const badge = document.getElementById('sentidoActiveBadge');
            if (currentDriverSentido === 'retorno') {
                badge.textContent = '🔴 Retorno';
                badge.style.color = '#ff5252';
                badge.style.background = 'rgba(255, 82, 82, 0.1)';
            } else {
                badge.textContent = '🔵 Ida';
                badge.style.color = '#22d3ee';
                badge.style.background = 'rgba(34, 211, 238, 0.1)';
            }
        }

        function toggleActiveSentido() {
            currentDriverSentido = currentDriverSentido === 'ida' ? 'retorno' : 'ida';
            updateSentidoActiveBadge();
            addLog(`Sentido cambiado a: ${currentDriverSentido === 'ida' ? 'Ida' : 'Retorno'}`);
        }

        function startDriverMode() {
            const companyId = document.getElementById('driverCompany').value;
            const vehicleId = document.getElementById('driverVehicle').value;
            const driverName = document.getElementById('driverName').value.trim();

            if (!companyId || !vehicleId || !driverName) {
                showToast('Completa todos los campos', 'info');
                return;
            }
            if (!navigator.geolocation) {
                showToast('Tu navegador no soporta GPS', 'error');
                return;
            }

            activeDriverPath = { companyId, vehicleId };
            const company = companies[companyId];
            updateSentidoActiveBadge();

            // Estado del recorrido actual, para guardar el historial al finalizar.
            currentTripStartTime = Date.now();
            currentTripDistanceM = 0;
            currentTripLastPos = null;
            // Reinicia el throttle: la primera lectura de este recorrido
            // siempre se envia de inmediato, sin importar la velocidad.
            lastFirebaseSendTime = 0;

            // Parte 37: cada recorrido nuevo empieza sin reportar ocupacion.
            currentOccupancy = null;
            document.querySelectorAll('.occupancy-btn').forEach(btn => btn.classList.remove('active'));

            // Limpia avisos de espera de un recorrido anterior y activa el
            // listener para este vehiculo (Parte 26).
            knownWaitingIds = {};
            const waitingAlertEl = document.getElementById('waitingAlert');
            if (waitingAlertEl) waitingAlertEl.style.display = 'none';
            listenForWaitingPassengers(companyId, vehicleId);

            // Limpia la vista de "vehiculo adelante/atras" del recorrido
            // anterior (Parte 27); se vuelve a llenar con la primera lectura.
            const aheadElInit = document.getElementById('adjacentAheadText');
            const behindElInit = document.getElementById('adjacentBehindText');
            if (aheadElInit) aheadElInit.textContent = '—';
            if (behindElInit) behindElInit.textContent = '—';

            document.getElementById('driverLogin').style.display = 'none';
            document.getElementById('driverActive').classList.add('show');
            document.body.classList.add('map-fullscreen');

            packetsSent = 0;
            addLog('Recorrido iniciado. Activando GPS real...');
            setDriverStatus('wait', 'Solicitando permiso de ubicación...');

            // Parte 42: drawer colapsado al iniciar, para que el conductor
            // vea el mapa completo apenas arranca el recorrido.
            collapseDriverDrawer();

            setTimeout(() => {
                if (!driverMap) {
                    // Parte 42: mismo motor vectorial que el mapa del
                    // pasajero (MapLibre GL + vura-map-style.json), para que
                    // toda la app comparta una sola identidad visual. La
                    // diferencia es que aqui se apaga la extrusion 3D de
                    // edificios (building-3d) apenas el estilo carga: el
                    // conductor tiene la pantalla encendida horas seguidas
                    // transmitiendo GPS, asi que ese gasto extra de GPU/
                    // bateria no se justifica para el (ver Parte 41).
                    driverMap = L.map('driverMap', { zoomControl: false, attributionControl: true, minZoom: 3 }).setView([-12.04, -77.03], 15);
                    const driverGlLayer = L.maplibreGL({
                        style: 'vura-map-style.json',
                        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(driverMap);
                    driverGlLayer.getMaplibreMap().once('styledata', () => {
                        const glMap = driverGlLayer.getMaplibreMap();
                        if (glMap.getLayer('building-3d')) {
                            glMap.setLayoutProperty('building-3d', 'visibility', 'none');
                        }
                    });
                }
                if (company && company.routePointsIda) {
                    L.polyline(company.routePointsIda, {
                        color: '#22d3ee', weight: 4, opacity: 0.6, dashArray: '10, 8', className: 'route-line-ida'
                    }).addTo(driverMap);
                }
                if (company && company.routePointsRetorno) {
                    L.polyline(company.routePointsRetorno, {
                        color: '#ff5252', weight: 4, opacity: 0.6, dashArray: '10, 8', className: 'route-line-retorno'
                    }).addTo(driverMap);
                }
            }, 50);

            watchId = navigator.geolocation.watchPosition(onDriverPosition, onDriverError, {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 20000
            });
        }

        let lastSpeedSampleTime = null;
        let lastSpeedSamplePos = null;
        let lastHeading = null;
        let lastHeadingSamplePos = null;

        function estimateSpeedKmh(pos) {
            if (typeof pos.coords.speed === 'number' && pos.coords.speed !== null && pos.coords.speed >= 0) {
                return pos.coords.speed * 3.6;
            }
            const now = Date.now();
            if (lastSpeedSamplePos && lastSpeedSampleTime) {
                const dtSec = (now - lastSpeedSampleTime) / 1000;
                if (dtSec > 0) {
                    const distM = haversine(lastSpeedSamplePos.lat, lastSpeedSamplePos.lng, pos.coords.latitude, pos.coords.longitude);
                    const kmh = (distM / dtSec) * 3.6;
                    lastSpeedSampleTime = now;
                    lastSpeedSamplePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    return kmh;
                }
            }
            lastSpeedSampleTime = now;
            lastSpeedSamplePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            return 0;
        }

        // Usa el heading nativo del GPS si esta disponible y es confiable;
        // si no, lo calcula comparando con la lectura anterior. Se ignoran
        // saltos minimos (<5m) para evitar que la flecha "tiemble" cuando
        // el vehiculo esta casi detenido.
        function estimateHeading(pos) {
            if (typeof pos.coords.heading === 'number' && pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
                lastHeading = pos.coords.heading;
                lastHeadingSamplePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                return lastHeading;
            }
            if (lastHeadingSamplePos) {
                const distM = haversine(lastHeadingSamplePos.lat, lastHeadingSamplePos.lng, pos.coords.latitude, pos.coords.longitude);
                if (distM >= 5) {
                    lastHeading = calculateBearing(lastHeadingSamplePos.lat, lastHeadingSamplePos.lng, pos.coords.latitude, pos.coords.longitude);
                    lastHeadingSamplePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                }
            } else {
                lastHeadingSamplePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            }
            return lastHeading;
        }


        // Decide si esta lectura de GPS debe escribirse a Firebase, segun
        // la velocidad actual: detenido = cada 12s, lento = cada 6s, rapido
        // = cada 2.5s. El navegador no permite fijar la frecuencia exacta
        // de watchPosition, asi que en vez de eso "throttleamos" cuantas de
        // esas lecturas realmente subimos a la base de datos en linea. La
        // UI local (mapa, textos en pantalla del conductor) sigue
        // actualizandose en cada lectura, sin importar el throttle.
        function shouldSendToFirebaseNow(speedKmh) {
            const now = Date.now();
            const elapsed = now - lastFirebaseSendTime;
            let minInterval;
            if (speedKmh < 3) minInterval = 12000;       // detenido
            else if (speedKmh < 20) minInterval = 6000;   // lento
            else minInterval = 2500;                       // rapido
            if (elapsed >= minInterval) {
                lastFirebaseSendTime = now;
                return true;
            }
            return false;
        }

        // ==================== AVISO "PASAJERO ESPERANDO" (Parte 26) ====================
        // Escucha esperando/{companyId}/{vehicleId}, donde cada pasajero que
        // toca "Estoy esperando este bus" agrega un registro con timestamp.
        // Cuando aparece un registro nuevo (no visto antes), avisa al
        // conductor con sonido + vibracion + entrada en el log.
        function listenForWaitingPassengers(companyId, vehicleId) {
            if (!window.firebaseReady) return;
            const waitRef = window.fbRef(window.fbDb, `esperando/${companyId}/${vehicleId}`);
            waitingListenerUnsub = window.fbOnValue(waitRef, (snap) => {
                const data = snap.val() || {};
                const now = Date.now();
                let activeCount = 0;
                Object.keys(data).forEach(id => {
                    const entry = data[id];
                    const ageMs = now - (entry && entry.timestamp || 0);
                    // Limpieza ligera: un aviso de hace mas de 10 minutos ya
                    // no es util (el pasajero seguro ya se fue o subio a
                    // otro bus); lo borramos para no acumular basura.
                    if (ageMs > 10 * 60 * 1000) {
                        window.fbSet(window.fbRef(window.fbDb, `esperando/${companyId}/${vehicleId}/${id}`), null);
                        return;
                    }
                    activeCount++;
                    if (!knownWaitingIds[id]) {
                        knownWaitingIds[id] = true;
                        playWaitingAlertSound();
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                        addLog('🙋 Un pasajero avisó que está esperando tu bus.');
                    }
                });
                updateWaitingAlertUI(activeCount);
            });
        }

        function updateWaitingAlertUI(count) {
            const alertEl = document.getElementById('waitingAlert');
            const textEl = document.getElementById('waitingAlertText');
            if (!alertEl || !textEl) return;
            if (count > 0) {
                alertEl.style.display = 'flex';
                textEl.textContent = count === 1
                    ? '1 pasajero esperando tu bus'
                    : `${count} pasajeros esperando tu bus`;
            } else {
                alertEl.style.display = 'none';
            }
        }

        // Pitido corto con Web Audio API (sin archivo de audio externo).
        // Si el navegador bloquea audio sin interaccion previa, simplemente
        // no suena; la vibracion y el aviso visual funcionan igual.
        function playWaitingAlertSound() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const beep = (freq, delay) => {
                    setTimeout(() => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'sine';
                        osc.frequency.value = freq;
                        gain.gain.value = 0.15;
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.18);
                    }, delay);
                };
                beep(880, 0);
                beep(1100, 220);
            } catch (e) {
                console.warn('No se pudo reproducir el sonido de aviso:', e);
            }
        }

        // ==================== VEHÍCULO ADELANTE/ATRÁS (Parte 27) ====================
        // Compara el avance en la ruta (distancia restante hasta el destino,
        // siguiendo la ruta real) entre este vehiculo y los demas de la
        // MISMA empresa y MISMO sentido que esten en linea ahora mismo.
        // Menos distancia restante = mas avanzado (adelante); mas distancia
        // restante = menos avanzado (atras). Se recalcula en cada lectura
        // de GPS, usando liveVehicles (variable global ya mantenida por el
        // listener principal de vehiculos_live).
        function updateAdjacentVehicles(companyId, vehicleId, lat, lng, ownSpeedKmh) {
            const aheadEl = document.getElementById('adjacentAheadText');
            const behindEl = document.getElementById('adjacentBehindText');
            if (!aheadEl || !behindEl) return;

            const company = companies[companyId];
            if (!company) return;
            const points = currentDriverSentido === 'retorno' ? company.routePointsRetorno : company.routePointsIda;
            if (!points || points.length < 2) {
                aheadEl.textContent = '—';
                behindEl.textContent = '—';
                return;
            }

            const ownRemaining = distanceAlongRoute(points, lat, lng);
            if (ownRemaining === null) {
                aheadEl.textContent = 'Fuera de ruta';
                behindEl.textContent = 'Fuera de ruta';
                return;
            }

            const others = [];
            const companyLive = liveVehicles[companyId] || {};
            Object.keys(companyLive).forEach(vid => {
                if (vid === vehicleId) return;
                const live = companyLive[vid];
                if (!live || !isOnline(live) || live.sentido !== currentDriverSentido) return;
                const remaining = distanceAlongRoute(points, live.lat, live.lng);
                if (remaining === null) return;
                const vehicleData = (company.vehicles || {})[vid] || {};
                others.push({ plate: vehicleData.plate || vid, remaining });
            });

            // El mas cercano "adelante" es el que tiene menos distancia
            // restante que yo, pero la mayor de ese grupo (el inmediato
            // siguiente en la ruta, no el mas lejano).
            const ahead = others.filter(o => o.remaining < ownRemaining)
                .sort((a, b) => b.remaining - a.remaining)[0];
            // El mas cercano "atras" es el que tiene mas distancia restante
            // que yo, pero la menor de ese grupo.
            const behind = others.filter(o => o.remaining > ownRemaining)
                .sort((a, b) => a.remaining - b.remaining)[0];

            // Para convertir la brecha de distancia en un estimado de
            // minutos, usamos la velocidad propia actual (con un piso de
            // 3 km/h para no dividir por casi cero), o 18 km/h de respaldo
            // si por algun motivo no hay velocidad valida.
            const speedMs = Math.max(3, ownSpeedKmh || 18) / 3.6;

            if (ahead) {
                const gapM = ownRemaining - ahead.remaining;
                const gapMin = Math.max(1, Math.round((gapM / speedMs) / 60));
                aheadEl.textContent = `${ahead.plate} · ${(gapM / 1000).toFixed(1)} km (~${gapMin} min)`;
            } else {
                aheadEl.textContent = 'Eres el primero';
            }

            if (behind) {
                const gapM = behind.remaining - ownRemaining;
                const gapMin = Math.max(1, Math.round((gapM / speedMs) / 60));
                behindEl.textContent = `${behind.plate} · ${(gapM / 1000).toFixed(1)} km (~${gapMin} min)`;
            } else {
                behindEl.textContent = 'Eres el último';
            }
        }

        // ==================== OCUPACIÓN (Parte 37) ====================
        // El conductor reporta a mano que tan lleno va el bus. Queda
        // guardado en currentOccupancy para que viaje en cada escritura
        // normal de GPS (asi no se pierde con el throttle adaptativo), y
        // ademas se manda de inmediato en una escritura aparte, para que el
        // pasajero lo vea sin tener que esperar el siguiente ciclo de GPS.
        function setOccupancy(level) {
            currentOccupancy = level;
            document.querySelectorAll('.occupancy-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.level === level);
            });
            if (activeDriverPath && window.firebaseReady) {
                const { companyId, vehicleId } = activeDriverPath;
                window.fbSet(window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}/ocupacion`), level);
            }
        }

        function onDriverPosition(pos) {
            if (!activeDriverPath) return;
            const { companyId, vehicleId } = activeDriverPath;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const acc = Math.round(pos.coords.accuracy);
            const speedKmh = Math.max(0, estimateSpeedKmh(pos));
            const heading = estimateHeading(pos);

            // Acumula distancia recorrida en este viaje, para el historial.
            if (currentTripLastPos) {
                const stepM = haversine(currentTripLastPos.lat, currentTripLastPos.lng, lat, lng);
                // Ignora saltos enormes (GPS con error grande) que distorsionarian el total.
                if (stepM < 500) currentTripDistanceM += stepM;
            }
            currentTripLastPos = { lat, lng };

            document.getElementById('driverLat').textContent = lat.toFixed(6);
            document.getElementById('driverLng').textContent = lng.toFixed(6);
            document.getElementById('driverSpeed').textContent = `${Math.round(speedKmh)} km/h`;
            const speedSummaryEl = document.getElementById('driverSpeedSummary');
            if (speedSummaryEl) speedSummaryEl.textContent = `${Math.round(speedKmh)} km/h`;

            const accuracyEl = document.getElementById('driverAccuracy');
            accuracyEl.textContent = `±${acc} m`;
            const quality = gpsQuality(acc);
            accuracyEl.className = quality.cssClass;
            const qualityDotEl = document.getElementById('driverGpsQualityDot');
            if (qualityDotEl) {
                qualityDotEl.textContent = quality.dot;
                qualityDotEl.title = quality.label;
            }

            const moveStatusEl = document.getElementById('driverMoveStatus');
            if (speedKmh < 3) {
                moveStatusEl.textContent = 'Detenido';
                moveStatusEl.style.color = 'var(--warning)';
            } else {
                moveStatusEl.textContent = 'En movimiento';
                moveStatusEl.style.color = 'var(--success)';
            }

            if (driverMap) {
                const company = companies[companyId] || {};
                const vehicleData = (company.vehicles || {})[vehicleId] || {};
                const plateLabel = vehicleData.plate || vehicleId;
                const sentidoColor = currentDriverSentido === 'retorno' ? '#ff5252' : '#22d3ee';

                if (driverMarker) {
                    const fromLatLng = driverMarker.getLatLng();
                    animateMarkerTo(driverMarker, fromLatLng, [lat, lng], 1200);
                    driverMarker.setIcon(createVehicleIcon(sentidoColor, speedKmh >= 3, plateLabel, heading));
                } else {
                    driverMarker = L.marker([lat, lng], {
                        icon: createVehicleIcon(sentidoColor, speedKmh >= 3, plateLabel, heading)
                    }).addTo(driverMap);
                }
                // Parte 43: pan suave en vez de salto duro cada vez que llega
                // una lectura GPS nueva (cada pocos segundos); easeTo anima
                // la camara igual que panTo en el mapa del pasajero.
                driverMap.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
            }

            addLog(`GPS leído → ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${acc}m, ${Math.round(speedKmh)} km/h)`);

            // Parte 27: recalcula que vehiculo de la misma empresa va
            // adelante/atras en la ruta, con cada lectura de GPS.
            updateAdjacentVehicles(companyId, vehicleId, lat, lng, speedKmh);

            if (!window.firebaseReady) {
                setDriverStatus('err', 'GPS ok, pero Firebase no está listo');
                addLog('Aviso: Firebase no listo, dato no enviado.');
                return;
            }

            // Parte 39: si quedaron posiciones guardadas de un corte de
            // señal anterior y ya hay conexion, las reenvia antes de seguir
            // con la lectura actual.
            if (navigator.onLine && getOfflineQueue().length) {
                flushOfflineQueue();
            }

            // Parte 25: throttle adaptativo. Si todavia no toca enviar
            // segun la velocidad actual, no escribimos a Firebase en este
            // ciclo — la UI local ya se actualizo arriba igual.
            if (!shouldSendToFirebaseNow(speedKmh)) {
                return;
            }

            const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
            const payload = {
                lat, lng, accuracy: acc, speed: speedKmh,
                heading: (typeof heading === 'number') ? heading : null,
                sentido: currentDriverSentido,
                driver: document.getElementById('driverName').value.trim(),
                ocupacion: currentOccupancy,
                timestamp: Date.now()
            };
            window.fbSet(liveRef, payload).then(() => {
                packetsSent++;
                document.getElementById('driverSent').textContent = packetsSent;
                const sentSummaryEl = document.getElementById('driverSentSummary');
                if (sentSummaryEl) sentSummaryEl.textContent = packetsSent;
                setDriverStatus('ok', 'Transmitiendo a Firebase en vivo');
                addLog(`Enviado #${packetsSent} a Firebase.`);
            }).catch(err => {
                // Parte 39: sin señal o sin internet. En vez de perder la
                // posicion, la guardamos en este celular (localStorage) y
                // la reintentamos mas adelante, para que el bus no
                // "desaparezca" del sistema mientras dura el corte.
                queueOfflineReading(payload);
                const pending = getOfflineQueue().length;
                setDriverStatus('err', `Sin conexión: ${pending} posición(es) guardadas en este celular`);
                addLog(`Sin conexión a Firebase. Posición guardada localmente (${pending} en espera).`);
            });
        }

        // ==================== CACHÉ OFFLINE DE GPS (Parte 39) ====================
        // Si el conductor pierde señal de internet (tunel, zona sin
        // cobertura), las posiciones que no se pudieron subir se guardan
        // aqui (localStorage, sobrevive aunque se recargue la pagina) y se
        // reenvian apenas vuelve la conexion, en orden, con una pequeña
        // pausa entre cada una para que el marcador del pasajero "recorra"
        // el camino real en vez de saltar de golpe al punto final.
        const OFFLINE_QUEUE_KEY = 'vura_offline_gps_queue';
        const OFFLINE_QUEUE_MAX = 60; // tope para no llenar el almacenamiento si el corte dura mucho

        function getOfflineQueue() {
            try {
                const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        function queueOfflineReading(reading) {
            try {
                const queue = getOfflineQueue();
                queue.push(reading);
                while (queue.length > OFFLINE_QUEUE_MAX) queue.shift();
                localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
            } catch (e) {
                console.warn('No se pudo guardar la lectura GPS sin conexión:', e);
            }
        }

        function clearOfflineQueue() {
            try { localStorage.removeItem(OFFLINE_QUEUE_KEY); } catch (e) {}
        }

        let flushingOfflineQueue = false;

        async function flushOfflineQueue() {
            if (flushingOfflineQueue) return; // ya hay un envio en curso, no duplicar
            const queue = getOfflineQueue();
            if (!queue.length || !activeDriverPath || !window.firebaseReady) return;

            flushingOfflineQueue = true;
            // A5-fix: NO borramos la cola aqui. Si la conexion se vuelve a
            // cortar a mitad del for-await, las posiciones no enviadas siguen
            // en localStorage y se intentaran enviar en el proximo flush.
            // Solo limpiamos al final, cuando sabemos que todo se envio.
            addLog(`Conexión recuperada. Enviando ${queue.length} posición(es) guardadas...`);
            const { companyId, vehicleId } = activeDriverPath;
            const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
            let enviados = 0;

            for (const reading of queue) {
                try {
                    await window.fbSet(liveRef, reading);
                    await new Promise(resolve => setTimeout(resolve, 350));
                    enviados++;
                } catch (e) {
                    addLog('Se cortó la señal otra vez mientras se enviaban las posiciones guardadas.');
                    break;
                }
            }

            // Solo eliminamos los que sí llegaron a enviarse.
            if (enviados === queue.length) {
                clearOfflineQueue();
            } else {
                // Guardamos solo los que no se enviaron.
                const pendientes = queue.slice(enviados);
                localStorage.setItem('vura_offline_queue', JSON.stringify(pendientes));
            }
            addLog(`${enviados}/${queue.length} posiciones enviadas. Transmisión normal restablecida.`);
            flushingOfflineQueue = false;
        }

        window.addEventListener('online', () => {
            if (activeDriverPath) flushOfflineQueue();
        });

        function friendlyGpsError(err) {
            switch (err.code) {
                case 1: // PERMISSION_DENIED
                    return 'No diste permiso de ubicación. Activa el permiso de ubicación para este sitio en tu navegador y vuelve a intentar.';
                case 2: // POSITION_UNAVAILABLE
                    return 'No se pudo obtener tu ubicación. Verifica que el GPS de tu celular esté activado.';
                case 3: // TIMEOUT
                    return 'El GPS está tardando en responder. Si estás en interiores, acércate a una ventana o sal al exterior.';
                default:
                    return 'No se pudo leer tu ubicación. Intenta de nuevo en unos segundos.';
            }
        }

        function onDriverError(err) {
            const friendly = friendlyGpsError(err);
            setDriverStatus('err', friendly);
            addLog(`Error de geolocalización (código ${err.code}): ${err.message}`);
        }

        function confirmFinishRecorrido() {
            const ok = window.confirm('¿Seguro que quieres finalizar el recorrido? Se dejará de compartir tu ubicación con los pasajeros.');
            if (ok) stopDriverMode();
        }

        function stopDriverMode() {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId); // libera el GPS y ahorra batería
                watchId = null;
            }
            // Apaga el listener de avisos de espera de este vehiculo y
            // borra los avisos pendientes: el recorrido terminó, ya no
            // tiene sentido seguir mostrandolos al proximo conductor.
            if (waitingListenerUnsub) {
                waitingListenerUnsub();
                waitingListenerUnsub = null;
            }
            knownWaitingIds = {};
            const waitingAlertEl = document.getElementById('waitingAlert');
            if (waitingAlertEl) waitingAlertEl.style.display = 'none';
            const aheadElReset = document.getElementById('adjacentAheadText');
            const behindElReset = document.getElementById('adjacentBehindText');
            if (aheadElReset) aheadElReset.textContent = '—';
            if (behindElReset) behindElReset.textContent = '—';
            clearOfflineQueue();

            if (activeDriverPath && window.firebaseReady) {
                const { companyId, vehicleId } = activeDriverPath;
                // Borra tanto la posicion en vivo como los avisos de espera
                // pendientes de este vehiculo: el recorrido terminó.
                window.fbSet(window.fbRef(window.fbDb, `esperando/${companyId}/${vehicleId}`), null);
                const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
                window.fbSet(liveRef, null);

                // Guarda el registro de este recorrido en el historial de la empresa,
                // para que el panel Admin pueda mostrar cuantos recorridos se hicieron.
                if (currentTripStartTime) {
                    const company = companies[companyId] || {};
                    const vehicleData = (company.vehicles || {})[vehicleId] || {};
                    const tripRecord = {
                        vehicleId,
                        plate: vehicleData.plate || vehicleId,
                        driver: document.getElementById('driverName').value.trim(),
                        sentido: currentDriverSentido,
                        startTime: currentTripStartTime,
                        endTime: Date.now(),
                        durationMin: Math.max(1, Math.round((Date.now() - currentTripStartTime) / 60000)),
                        distanceKm: Math.round((currentTripDistanceM / 1000) * 10) / 10
                    };
                    const historyRef = window.fbRef(window.fbDb, `historial/${companyId}`);
                    window.fbPush(historyRef, tripRecord).catch(err => {
                        console.error('Error guardando historial:', err);
                    });
                }
            }
            activeDriverPath = null;
            driverMarker = null;
            setDriverSentido('ida');
            currentTripStartTime = null;
            currentTripDistanceM = 0;
            currentTripLastPos = null;

            document.getElementById('driverLogin').style.display = 'block';
            document.getElementById('driverActive').classList.remove('show');
            document.body.classList.remove('map-fullscreen');
            resetSwipeToStart();

            addLog('Recorrido finalizado. GPS apagado, ya no se comparte ubicación.');
            showToast('Recorrido finalizado', 'info');
        }

        window.startDriverMode = startDriverMode;
        window.setDriverSentido = setDriverSentido;
        window.toggleActiveSentido = toggleActiveSentido;
        window.stopDriverMode = stopDriverMode;
        window.setOccupancy = setOccupancy;

        // ==================== SWIPE-TO-START (Parte 33) ====================
        // Reemplaza el boton normal de "Iniciar recorrido" por un control de
        // deslizar: el conductor tiene que arrastrar el circulo de un
        // extremo al otro, no solo tocarlo. Un toque accidental con el
        // celular en el tablero ya no dispara el recorrido por error; hace
        // falta un gesto intencional y sostenido, igual que "deslizar para
        // contestar" en los celulares.
        function setupSwipeToStart() {
            const slider = document.getElementById('startSwipeSlider');
            const handle = document.getElementById('swipeHandle');
            const fill = document.getElementById('swipeSliderFill');
            if (!slider || !handle) return;

            let dragging = false;
            let startX = 0;
            let maxDistance = 0;

            function onPointerDown(e) {
                if (slider.classList.contains('completed')) return;
                dragging = true;
                slider.classList.add('dragging');
                startX = e.clientX;
                maxDistance = slider.clientWidth - handle.offsetWidth - 6;
                if (handle.setPointerCapture) {
                    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
                }
            }

            function onPointerMove(e) {
                if (!dragging) return;
                let delta = e.clientX - startX;
                delta = Math.max(0, Math.min(delta, maxDistance));
                handle.style.left = (3 + delta) + 'px';
                if (fill) fill.style.width = (delta + handle.offsetWidth / 2) + 'px';
            }

            function finishDrag() {
                if (!dragging) return;
                dragging = false;
                slider.classList.remove('dragging');
                const currentLeft = parseFloat(handle.style.left || '3');
                const dragged = currentLeft - 3;
                // Hace falta deslizar al menos el 82% del recorrido para que
                // cuente como intencional; menos que eso, vuelve al inicio.
                if (maxDistance > 0 && (dragged / maxDistance) >= 0.82) {
                    handle.style.left = (maxDistance + 3) + 'px';
                    if (fill) fill.style.width = '100%';
                    slider.classList.add('completed');
                    startDriverMode();
                } else {
                    handle.style.left = '3px';
                    if (fill) fill.style.width = '0';
                }
            }

            handle.addEventListener('pointerdown', onPointerDown);
            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', finishDrag);
            handle.addEventListener('pointercancel', finishDrag);
        }

        // Vuelve el slider a su posicion inicial (al finalizar un recorrido,
        // para que quede listo para el proximo).
        function resetSwipeToStart() {
            const slider = document.getElementById('startSwipeSlider');
            const handle = document.getElementById('swipeHandle');
            const fill = document.getElementById('swipeSliderFill');
            if (!slider || !handle) return;
            slider.classList.remove('completed', 'dragging');
            handle.style.left = '3px';
            if (fill) fill.style.width = '0';
        }

        // ==================== PARTE 42: DRAWER DEL MAPA PANTALLA COMPLETA ====================
        // El mapa del conductor ahora ocupa toda la pantalla; el drawer de
        // abajo empieza colapsado (solo barra resumen: velocidad, sentido,
        // envios) para no tapar el mapa mientras maneja, y se expande con
        // un toque para ver GPS detallado, vehiculos adyacentes, ocupacion
        // y el log. El estado por defecto es colapsado al iniciar un
        // recorrido nuevo (ver startDriverMode).
        function toggleDriverDrawer() {
            const drawer = document.getElementById('driverDrawer');
            if (!drawer) return;
            drawer.classList.toggle('expanded');
        }

        function collapseDriverDrawer() {
            const drawer = document.getElementById('driverDrawer');
            if (drawer) drawer.classList.remove('expanded');
        }

        window.toggleDriverDrawer = toggleDriverDrawer;

        setupSwipeToStart();
        window.confirmFinishRecorrido = confirmFinishRecorrido;
