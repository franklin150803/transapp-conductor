// driver.js
// Vista del conductor: motor real de GPS (watchPosition), calculo de
// velocidad y rumbo, seleccion de sentido (ida/retorno), envio de
// ubicacion a Firebase, y flujo de iniciar/finalizar recorrido con
// confirmacion. 

        let currentTripStartTime = null;
        let currentTripDistanceM = 0;
        let currentTripLastPos = null;

        let lastFirebaseSendTime = 0;

        let currentOccupancy = null;

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

            currentTripStartTime = Date.now();
            currentTripDistanceM = 0;
            currentTripLastPos = null;
            lastFirebaseSendTime = 0;

            currentOccupancy = null;
            document.querySelectorAll('.occupancy-btn').forEach(btn => btn.classList.remove('active'));

            knownWaitingIds = {};
            const waitingAlertEl = document.getElementById('waitingAlert');
            if (waitingAlertEl) waitingAlertEl.style.display = 'none';
            listenForWaitingPassengers(companyId, vehicleId);

            const aheadElInit = document.getElementById('adjacentAheadText');
            const behindElInit = document.getElementById('adjacentBehindText');
            if (aheadElInit) aheadElInit.textContent = '—';
            if (behindElInit) behindElInit.textContent = '—';

            document.getElementById('driverLogin').style.display = 'none';
            document.getElementById('driverActive').classList.add('show');

            packetsSent = 0;
            addLog('Recorrido iniciado. Activando GPS real...');
            setDriverStatus('wait', 'Solicitando permiso de ubicación...');

            setTimeout(() => {
                if (!driverMap) {
                    driverMap = L.map('driverMap').setView([-12.04, -77.03], 14);
                    
                    // Mapa vectorial MapLibre GL con estilo propio de Vura
                    L.maplibreGL({
                        style: 'vura-map-style.json'
                    }).addTo(driverMap);
                }
                if (company && company.routePointsIda) {
                    L.polyline(company.routePointsIda, {
                        color: '#22d3ee', weight: 5, opacity: 0.8, className: 'route-line-ida'
                    }).addTo(driverMap);
                }
                if (company && company.routePointsRetorno) {
                    L.polyline(company.routePointsRetorno, {
                        color: '#ff5252', weight: 5, opacity: 0.8, className: 'route-line-retorno'
                    }).addTo(driverMap);
                }
                // Fuerza recalcular tamaño porque ahora es fullscreen
                setTimeout(() => driverMap.invalidateSize(), 100);
            }, 50);

            watchId = navigator.geolocation.watchPosition(onDriverPosition, onDriverError, {
                enableHighAccuracy: false,
                maximumAge: 5000,
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

            const ahead = others.filter(o => o.remaining < ownRemaining)
                .sort((a, b) => b.remaining - a.remaining)[0];
            const behind = others.filter(o => o.remaining > ownRemaining)
                .sort((a, b) => a.remaining - b.remaining)[0];

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

            if (currentTripLastPos) {
                const stepM = haversine(currentTripLastPos.lat, currentTripLastPos.lng, lat, lng);
                if (stepM < 500) currentTripDistanceM += stepM;
            }
            currentTripLastPos = { lat, lng };

            document.getElementById('driverLat').textContent = lat.toFixed(6);
            document.getElementById('driverLng').textContent = lng.toFixed(6);
            document.getElementById('driverSpeed').textContent = `${Math.round(speedKmh)} km/h`;

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
                    driverMarker.setLatLng([lat, lng]);
                    driverMarker.setIcon(createVehicleIcon(sentidoColor, speedKmh >= 3, plateLabel, heading));
                } else {
                    driverMarker = L.marker([lat, lng], {
                        icon: createVehicleIcon(sentidoColor, speedKmh >= 3, plateLabel, heading)
                    }).addTo(driverMap);
                }
                driverMap.setView([lat, lng], 16);
            }

            addLog(`GPS leído → ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${acc}m, ${Math.round(speedKmh)} km/h)`);

            updateAdjacentVehicles(companyId, vehicleId, lat, lng, speedKmh);

            if (!window.firebaseReady) {
                setDriverStatus('err', 'GPS ok, pero Firebase no está listo');
                addLog('Aviso: Firebase no listo, dato no enviado.');
                return;
            }

            if (navigator.onLine && getOfflineQueue().length) {
                flushOfflineQueue();
            }

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
                setDriverStatus('ok', 'Transmitiendo a Firebase en vivo');
                addLog(`Enviado #${packetsSent} a Firebase.`);
            }).catch(err => {
                queueOfflineReading(payload);
                const pending = getOfflineQueue().length;
                setDriverStatus('err', `Sin conexión: ${pending} posición(es) guardadas en este celular`);
                addLog(`Sin conexión a Firebase. Posición guardada localmente (${pending} en espera).`);
            });
        }

        // ==================== CACHÉ OFFLINE DE GPS (Parte 39) ====================
        const OFFLINE_QUEUE_KEY = 'vura_offline_gps_queue';
        const OFFLINE_QUEUE_MAX = 60;

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
            if (flushingOfflineQueue) return;
            const queue = getOfflineQueue();
            if (!queue.length || !activeDriverPath || !window.firebaseReady) return;

            flushingOfflineQueue = true;
            clearOfflineQueue();
            addLog(`Conexión recuperada. Enviando ${queue.length} posición(es) guardadas...`);
            const { companyId, vehicleId } = activeDriverPath;
            const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);

            for (const reading of queue) {
                try {
                    await window.fbSet(liveRef, reading);
                    await new Promise(resolve => setTimeout(resolve, 350));
                } catch (e) {
                    addLog('Se cortó la señal otra vez mientras se enviaban las posiciones guardadas.');
                    break;
                }
            }
            addLog('Posiciones guardadas enviadas. Transmisión normal restablecida.');
            flushingOfflineQueue = false;
        }

        window.addEventListener('online', () => {
            if (activeDriverPath) flushOfflineQueue();
        });

        function friendlyGpsError(err) {
            switch (err.code) {
                case 1:
                    return 'No diste permiso de ubicación. Activa el permiso de ubicación para este sitio en tu navegador y vuelve a intentar.';
                case 2:
                    return 'No se pudo obtener tu ubicación. Verifica que el GPS de tu celular esté activado.';
                case 3:
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
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
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
                window.fbSet(window.fbRef(window.fbDb, `esperando/${companyId}/${vehicleId}`), null);
                const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
                window.fbSet(liveRef, null);

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

        function resetSwipeToStart() {
            const slider = document.getElementById('startSwipeSlider');
            const handle = document.getElementById('swipeHandle');
            const fill = document.getElementById('swipeSliderFill');
            if (!slider || !handle) return;
            slider.classList.remove('completed', 'dragging');
            handle.style.left = '3px';
            if (fill) fill.style.width = '0';
        }

        setupSwipeToStart();
        window.confirmFinishRecorrido = confirmFinishRecorrido;

        // ==================== DRAWER CONDUCTOR (Parte 42) ====================
        function toggleDriverDrawer() {
            const drawer = document.getElementById('driverDrawer');
            if (drawer) drawer.classList.toggle('open');
        }
        window.toggleDriverDrawer = toggleDriverDrawer;
