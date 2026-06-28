// driver.js
// Vista del conductor: motor real de GPS (watchPosition), calculo de
// velocidad y rumbo, seleccion de sentido (ida/retorno), envio de
// ubicacion a Firebase, y flujo de iniciar/finalizar recorrido con
// confirmacion. Depende de variables globales del script principal
// (activeDriverPath, watchId, driverMap, driverMarker, packetsSent,
// currentDriverSentido, companies) y de funciones de utils.js
// (haversine) y map.js (createVehicleIcon). Debe cargarse antes del
// script principal.

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
                badge.style.color = '#dc2626';
                badge.style.background = 'rgba(220, 38, 38, 0.08)';
            } else {
                badge.textContent = '🔵 Ida';
                badge.style.color = '#2563eb';
                badge.style.background = 'rgba(37, 99, 235, 0.08)';
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

            document.getElementById('driverLogin').style.display = 'none';
            document.getElementById('driverActive').classList.add('show');
            document.getElementById('startBtn').disabled = true;

            packetsSent = 0;
            addLog('Recorrido iniciado. Activando GPS real...');
            setDriverStatus('wait', 'Solicitando permiso de ubicación...');

            setTimeout(() => {
                if (!driverMap) {
                    driverMap = L.map('driverMap').setView([-12.04, -77.03], 13);
                    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                        attribution: '© OpenStreetMap contributors © CARTO',
                        subdomains: 'abcd'
                    }).addTo(driverMap);
                }
                if (company && company.routePointsIda) {
                    L.polyline(company.routePointsIda, {
                        color: '#2563eb', weight: 4, opacity: 0.6, dashArray: '10, 8'
                    }).addTo(driverMap);
                }
                if (company && company.routePointsRetorno) {
                    L.polyline(company.routePointsRetorno, {
                        color: '#dc2626', weight: 4, opacity: 0.6, dashArray: '10, 8'
                    }).addTo(driverMap);
                }
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


        function onDriverPosition(pos) {
            if (!activeDriverPath) return;
            const { companyId, vehicleId } = activeDriverPath;
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const acc = Math.round(pos.coords.accuracy);
            const speedKmh = Math.max(0, estimateSpeedKmh(pos));
            const heading = estimateHeading(pos);

            document.getElementById('driverLat').textContent = lat.toFixed(6);
            document.getElementById('driverLng').textContent = lng.toFixed(6);
            document.getElementById('driverSpeed').textContent = `${Math.round(speedKmh)} km/h`;

            const accuracyEl = document.getElementById('driverAccuracy');
            accuracyEl.textContent = `±${acc} m`;
            accuracyEl.className = acc < 20 ? 'accuracy-good' : acc < 100 ? 'accuracy-medium' : 'accuracy-bad';

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
                const sentidoColor = currentDriverSentido === 'retorno' ? '#dc2626' : '#2563eb';

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

            if (!window.firebaseReady) {
                setDriverStatus('err', 'GPS ok, pero Firebase no está listo');
                addLog('Aviso: Firebase no listo, dato no enviado.');
                return;
            }

            const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
            window.fbSet(liveRef, {
                lat, lng, accuracy: acc, speed: speedKmh,
                heading: (typeof heading === 'number') ? heading : null,
                sentido: currentDriverSentido,
                driver: document.getElementById('driverName').value.trim(),
                timestamp: Date.now()
            }).then(() => {
                packetsSent++;
                document.getElementById('driverSent').textContent = packetsSent;
                setDriverStatus('ok', 'Transmitiendo a Firebase en vivo');
                addLog(`Enviado #${packetsSent} a Firebase.`);
            }).catch(err => {
                setDriverStatus('err', 'Error subiendo a Firebase');
                addLog('Error de Firebase: ' + err.message);
            });
        }

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
            if (activeDriverPath && window.firebaseReady) {
                const { companyId, vehicleId } = activeDriverPath;
                const liveRef = window.fbRef(window.fbDb, `vehiculos_live/${companyId}/${vehicleId}`);
                window.fbSet(liveRef, null);
            }
            activeDriverPath = null;
            driverMarker = null;
            setDriverSentido('ida');

            document.getElementById('driverLogin').style.display = 'block';
            document.getElementById('driverActive').classList.remove('show');
            document.getElementById('startBtn').disabled = false;

            addLog('Recorrido finalizado. GPS apagado, ya no se comparte ubicación.');
            showToast('Recorrido finalizado', 'info');
        }

        window.startDriverMode = startDriverMode;
        window.setDriverSentido = setDriverSentido;
        window.toggleActiveSentido = toggleActiveSentido;
        window.stopDriverMode = stopDriverMode;
        window.confirmFinishRecorrido = confirmFinishRecorrido;
