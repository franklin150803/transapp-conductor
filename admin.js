// admin.js
// Panel de administrador: registrar empresa nueva (con rutas generadas),
// agregar vehiculo a una empresa existente, listar vehiculos con su
// estado en linea/offline, y calcular las estadisticas (empresas,
// vehiculos, en linea) que se muestran en el dashboard. Depende de
// variables globales del script principal (companies, liveVehicles) y
// de la funcion isOnline() de map.js. Debe cargarse antes del script
// principal.

        // ==================== ADMIN VIEW ====================
        // ==================== EDITOR VISUAL DE RUTAS (Parte 51) ====================
        // Antes, registerCompany() generaba 6 puntos al azar alrededor de
        // Lima para simular una ruta — se veia bien en el mapa pero no
        // correspondia a ninguna calle real. Este editor reemplaza eso:
        // el admin toca el mapa punto por punto, en orden, para dibujar la
        // ruta de IDA y de RETORNO de verdad. Usa el mismo motor vectorial
        // (MapLibre GL + vura-map-style.json) que el resto de la app.
        let routeEditorMap = null;
        let routeEditorMode = 'ida'; // 'ida' | 'retorno'
        let routeEditorPointsIda = [];
        let routeEditorPointsRetorno = [];
        let routeEditorLineIda = null;
        let routeEditorLineRetorno = null;
        let routeEditorMarkersIda = [];
        let routeEditorMarkersRetorno = [];

        // Se inicializa la primera vez que se entra a la vista de admin
        // (lazy init, igual que el mapa del pasajero y del conductor),
        // porque el contenedor #routeEditorMap debe estar visible y con
        // tamaño real antes de que MapLibre pueda calcular su viewport.
        function initRouteEditorMapIfNeeded() {
            if (routeEditorMap) {
                setTimeout(() => routeEditorMap.invalidateSize(), 50);
                return;
            }
            routeEditorMap = L.map('routeEditorMap', {
                zoomControl: true,
                attributionControl: false
            }).setView([-12.0464, -77.0428], 12);

            L.maplibreGL({ style: 'vura-map-style.json' }).addTo(routeEditorMap);

            routeEditorMap.on('click', (e) => {
                addRouteEditorPoint(e.latlng.lat, e.latlng.lng);
            });
        }

        function setRouteEditorMode(mode) {
            routeEditorMode = mode;
            document.getElementById('routeEditorModeIda').classList.toggle('active', mode === 'ida');
            document.getElementById('routeEditorModeRetorno').classList.toggle('active', mode === 'retorno');
            const hint = document.getElementById('routeEditorHint');
            if (hint) {
                hint.textContent = mode === 'ida'
                    ? 'Toca el mapa para ir agregando puntos de la ruta de IDA, en orden, desde el origen hasta el destino.'
                    : 'Toca el mapa para ir agregando puntos de la ruta de RETORNO, en orden, desde el destino de vuelta al origen.';
            }
            updateRouteEditorCount();
        }

        function addRouteEditorPoint(lat, lng) {
            const color = routeEditorMode === 'ida' ? '#22d3ee' : '#ff5252';
            const points = routeEditorMode === 'ida' ? routeEditorPointsIda : routeEditorPointsRetorno;
            points.push([lat, lng]);

            const dot = L.circleMarker([lat, lng], {
                radius: 5, color, fillColor: color, fillOpacity: 1, weight: 2
            }).addTo(routeEditorMap);

            if (routeEditorMode === 'ida') routeEditorMarkersIda.push(dot);
            else routeEditorMarkersRetorno.push(dot);

            redrawRouteEditorLines();
            updateRouteEditorCount();
        }

        function undoRouteEditorPoint() {
            const points = routeEditorMode === 'ida' ? routeEditorPointsIda : routeEditorPointsRetorno;
            const markers = routeEditorMode === 'ida' ? routeEditorMarkersIda : routeEditorMarkersRetorno;
            if (!points.length) return;
            points.pop();
            const lastMarker = markers.pop();
            if (lastMarker) routeEditorMap.removeLayer(lastMarker);
            redrawRouteEditorLines();
            updateRouteEditorCount();
        }

        // Atajo util: muchas rutas de bus vuelven por una calle muy
        // parecida a la de ida. En vez de obligar al admin a dibujar dos
        // veces casi lo mismo, puede copiar la ida invertida como punto de
        // partida del retorno y ajustarla despues si hace falta.
        function mirrorRouteEditorRetorno() {
            if (!routeEditorPointsIda.length) {
                showToast('Primero dibuja la ruta de Ida', 'info');
                return;
            }
            routeEditorMarkersRetorno.forEach(m => routeEditorMap.removeLayer(m));
            routeEditorMarkersRetorno = [];
            routeEditorPointsRetorno = [...routeEditorPointsIda].reverse().map(p => [p[0], p[1]]);
            routeEditorPointsRetorno.forEach(([lat, lng]) => {
                const dot = L.circleMarker([lat, lng], {
                    radius: 5, color: '#ff5252', fillColor: '#ff5252', fillOpacity: 1, weight: 2
                }).addTo(routeEditorMap);
                routeEditorMarkersRetorno.push(dot);
            });
            redrawRouteEditorLines();
            updateRouteEditorCount();
            setRouteEditorMode('retorno');
            showToast('Retorno copiado desde Ida (invertido). Puedes ajustar los puntos.', 'success');
        }

        function clearRouteEditor() {
            [...routeEditorMarkersIda, ...routeEditorMarkersRetorno].forEach(m => routeEditorMap.removeLayer(m));
            routeEditorMarkersIda = [];
            routeEditorMarkersRetorno = [];
            routeEditorPointsIda = [];
            routeEditorPointsRetorno = [];
            redrawRouteEditorLines();
            updateRouteEditorCount();
        }

        function redrawRouteEditorLines() {
            if (routeEditorLineIda) { routeEditorMap.removeLayer(routeEditorLineIda); routeEditorLineIda = null; }
            if (routeEditorLineRetorno) { routeEditorMap.removeLayer(routeEditorLineRetorno); routeEditorLineRetorno = null; }
            if (routeEditorPointsIda.length > 1) {
                routeEditorLineIda = L.polyline(routeEditorPointsIda, { color: '#22d3ee', weight: 4, opacity: 0.85 }).addTo(routeEditorMap);
            }
            if (routeEditorPointsRetorno.length > 1) {
                routeEditorLineRetorno = L.polyline(routeEditorPointsRetorno, { color: '#ff5252', weight: 4, opacity: 0.85, dashArray: '6, 6' }).addTo(routeEditorMap);
            }
        }

        function updateRouteEditorCount() {
            const el = document.getElementById('routeEditorCount');
            if (!el) return;
            el.textContent = `${routeEditorPointsIda.length} ida · ${routeEditorPointsRetorno.length} retorno`;
        }

        function registerCompany() {
            const name = document.getElementById('regCompanyName').value.trim();
            const ruc = document.getElementById('regCompanyRuc').value.trim();
            const phone = document.getElementById('regCompanyPhone').value.trim();
            const route = document.getElementById('regCompanyRoute').value.trim();
            const schedule = document.getElementById('regCompanySchedule').value.trim();
            // Parte 45: lugares de paso, en texto libre separado por coma.
            // Se guardan como array para poder buscarlos uno por uno (y
            // resaltar exactamente cual coincidio con la busqueda del
            // pasajero), no como un solo bloque de texto.
            const destinosRaw = document.getElementById('regCompanyDestinos').value.trim();
            const destinos = destinosRaw ? destinosRaw.split(',').map(d => d.trim()).filter(Boolean) : [];

            if (!name || !ruc || !route) {
                showToast('Completa los campos obligatorios', 'info');
                return;
            }

            // Parte 51: la ruta ahora viene del editor visual, no de
            // coordenadas al azar. Exigimos al menos 2 puntos de Ida (una
            // linea necesita minimo 2); el Retorno es opcional al
            // registrar — si no se dibuja, se usa la Ida invertida como
            // respaldo razonable, igual que hacia el generador anterior,
            // pero ahora sobre una ruta real en vez de inventada.
            if (routeEditorPointsIda.length < 2) {
                showToast('Dibuja al menos 2 puntos de la ruta de Ida en el mapa', 'info');
                return;
            }

            const colors = ['#ec4899', '#3b82f6', '#f97316', '#06b6d4', '#84cc16', '#8b5cf6'];
            const newId = 'empresa' + Date.now().toString().slice(-6);

            const routePointsIda = routeEditorPointsIda.map(p => [p[0], p[1]]);
            const routePointsRetorno = routeEditorPointsRetorno.length >= 2
                ? routeEditorPointsRetorno.map(p => [p[0], p[1]])
                : [...routePointsIda].reverse();

            const newCompany = {
                name, ruc, route, phone,
                schedule: schedule || null,
                destinos,
                verified: true,
                color: colors[Object.keys(companies).length % colors.length],
                routePointsIda,
                routePointsRetorno,
                vehicles: {}
            };

            window.fbSet(window.fbRef(window.fbDb, 'empresas/' + newId), newCompany).then(() => {
                document.getElementById('regCompanyName').value = '';
                document.getElementById('regCompanyRuc').value = '';
                document.getElementById('regCompanyPhone').value = '';
                document.getElementById('regCompanyRoute').value = '';
                document.getElementById('regCompanySchedule').value = '';
                document.getElementById('regCompanyDestinos').value = '';
                clearRouteEditor();
                showToast(`Empresa "${name}" registrada con su ruta real`, 'success');
            }).catch(err => showToast('Error: ' + err.message, 'error'));
        }

        function populateAddVehicleSelect() {
            const select = document.getElementById('addVehicleCompany');
            const prev = select.value;
            select.innerHTML = '';
            Object.keys(companies).forEach(companyId => {
                const opt = document.createElement('option');
                opt.value = companyId;
                opt.textContent = companies[companyId].name;
                select.appendChild(opt);
            });
            if (prev && companies[prev]) select.value = prev;
        }

        function addVehicleToCompany() {
            const companyId = document.getElementById('addVehicleCompany').value;
            const plate = document.getElementById('addVehiclePlate').value.trim();

            if (!companyId || !plate) {
                showToast('Completa los campos', 'info');
                return;
            }

            const newVehicleId = 'vehiculo' + Date.now().toString().slice(-6);
            window.fbSet(window.fbRef(window.fbDb, `empresas/${companyId}/vehicles/${newVehicleId}`), {
                plate, driver: 'Sin asignar'
            }).then(() => {
                document.getElementById('addVehiclePlate').value = '';
                showToast(`Vehículo "${plate}" agregado`, 'success');
            }).catch(err => showToast('Error: ' + err.message, 'error'));
        }

        function renderAdminVehicleList() {
            const list = document.getElementById('vehicleListAdmin');
            if (!list) return;
            // Si la vista Admin no esta activa, no tiene sentido reconstruir
            // esta lista cada vez que cambia un vehiculo en vivo; se actualizara
            // de todas formas la proxima vez que el admin entre a esa pestaña.
            const adminView = document.getElementById('view-admin');
            if (!adminView || !adminView.classList.contains('active')) return;

            list.innerHTML = '';

            Object.keys(companies).forEach(companyId => {
                const company = companies[companyId];
                const vehicles = company.vehicles || {};
                Object.keys(vehicles).forEach(vehicleId => {
                    const vehicle = vehicles[vehicleId];
                    const live = (liveVehicles[companyId] || {})[vehicleId];
                    const online = isOnline(live);

                    const item = document.createElement('div');
                    item.className = 'vehicle-item';
                    item.innerHTML = `
                        <div class="vehicle-item-info">
                            <div class="vehicle-icon">${appIcon('bus', 22)}</div>
                            <div>
                                <div class="vehicle-item-name">${escapeHtml(vehicle.plate || vehicleId)}</div>
                                <div class="vehicle-item-plate">${escapeHtml(company.name)} · ${escapeHtml(vehicleId)}</div>
                            </div>
                        </div>
                        <span class="vehicle-item-status ${online ? 'online' : 'offline'}">
                            ${online ? '● En línea' : '○ Offline'}
                        </span>
                    `;
                    list.appendChild(item);
                });
            });
        }

        function updateStats() {
            let totalVehicles = 0;
            let onlineVehicles = 0;
            Object.keys(companies).forEach(companyId => {
                const vehicles = (companies[companyId] || {}).vehicles || {};
                totalVehicles += Object.keys(vehicles).length;
                Object.keys(vehicles).forEach(vid => {
                    if (isOnline((liveVehicles[companyId] || {})[vid])) onlineVehicles++;
                });
            });
            document.getElementById('statCompanies').textContent = Object.keys(companies).length;
            document.getElementById('statVehicles').textContent = totalVehicles;
            document.getElementById('statOnline').textContent = onlineVehicles;
        }

        // ==================== EMERGENCIAS SOS (Parte 48) ====================
        // Escucha emergencias/{companyId}/{vehicleId}/{id}, escrito por el
        // boton SOS del conductor (driver.js). A diferencia del aviso de
        // "pasajero esperando" (que solo ve el conductor de ESE vehiculo),
        // esto lo escucha el admin para TODAS las empresas a la vez, porque
        // el admin representa a la empresa en este modelo (un solo admin
        // global, sin roles granulares todavia). El listener queda activo
        // desde que arranca la app, no solo cuando el admin tiene esa
        // pestaña abierta, para no perder el sonido/vibracion de aviso.
        let knownEmergencyIds = {};
        const SOS_TYPE_LABELS = { accidente: 'Accidente', robo: 'Robo / asalto', averia: 'Avería', otro: 'Emergencia' };

        function listenForEmergencies() {
            if (!window.firebaseReady) return;
            const ref = window.fbRef(window.fbDb, 'emergencias');
            window.fbOnValue(ref, (snap) => {
                const data = snap.val() || {};
                const active = [];
                Object.keys(data).forEach(companyId => {
                    const vehiclesData = data[companyId] || {};
                    Object.keys(vehiclesData).forEach(vehicleId => {
                        const entries = vehiclesData[vehicleId] || {};
                        Object.keys(entries).forEach(id => {
                            const entry = entries[id] || {};
                            const fullId = companyId + '__' + vehicleId + '__' + id;
                            active.push({ id, companyId, vehicleId, type: entry.type, timestamp: entry.timestamp, lat: entry.lat, lng: entry.lng });

                            if (!knownEmergencyIds[fullId]) {
                                knownEmergencyIds[fullId] = true;
                                const company = companies[companyId];
                                const vehicle = company && company.vehicles && company.vehicles[vehicleId];
                                const plate = vehicle ? (vehicle.plate || vehicleId) : vehicleId;
                                const typeLabel = SOS_TYPE_LABELS[entry.type] || 'Emergencia';
                                playEmergencyAlertSound();
                                if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 300]);
                                showToast(`🆘 ${typeLabel}: bus ${plate}${company ? ' · ' + company.name : ''}`, 'error');
                            }
                        });
                    });
                });
                // Orden mas reciente primero, para que la emergencia mas
                // nueva (probablemente la mas urgente) quede arriba.
                active.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderEmergencyBanner(active);
            });
        }

        function renderEmergencyBanner(active) {
            const banner = document.getElementById('emergencyBanner');
            const list = document.getElementById('emergencyList');
            if (!banner || !list) return;

            if (active.length === 0) {
                banner.style.display = 'none';
                list.innerHTML = '';
                return;
            }

            banner.style.display = 'block';
            list.innerHTML = active.map(e => {
                const company = companies[e.companyId];
                const vehicle = company && company.vehicles && company.vehicles[e.vehicleId];
                const plate = vehicle ? (vehicle.plate || e.vehicleId) : e.vehicleId;
                const typeLabel = SOS_TYPE_LABELS[e.type] || 'Emergencia';
                const mapsLink = (e.lat && e.lng)
                    ? ` · <a href="https://maps.google.com/?q=${e.lat},${e.lng}" target="_blank" rel="noopener">Ver ubicación</a>`
                    : '';
                return `
                    <div class="emergency-item">
                        <div>
                            <div class="emergency-item-title">🆘 ${escapeHtml(typeLabel)} — ${escapeHtml(plate)}</div>
                            <div class="emergency-item-sub">${company ? escapeHtml(company.name) : ''} · ${formatTimeAgo(e.timestamp)}${mapsLink}</div>
                        </div>
                        <button class="emergency-resolve-btn" onclick="resolveEmergency('${e.companyId}','${e.vehicleId}','${e.id}')">Marcar atendida</button>
                    </div>
                `;
            }).join('');
        }

        function resolveEmergency(companyId, vehicleId, id) {
            window.fbSet(window.fbRef(window.fbDb, `emergencias/${companyId}/${vehicleId}/${id}`), null);
        }

        // Mismo patron de pitido que playWaitingAlertSound (driver.js), pero
        // con onda cuadrada y 3 tonos en vez de 2 para que se distinga al
        // oido de un aviso normal de "pasajero esperando".
        function playEmergencyAlertSound() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const beep = (freq, delay) => {
                    setTimeout(() => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.type = 'square';
                        osc.frequency.value = freq;
                        gain.gain.value = 0.16;
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.start();
                        osc.stop(ctx.currentTime + 0.16);
                    }, delay);
                };
                beep(880, 0);
                beep(660, 220);
                beep(880, 440);
            } catch (e) {
                console.warn('No se pudo reproducir el sonido de emergencia:', e);
            }
        }

        window.resolveEmergency = resolveEmergency;
        window.listenForEmergencies = listenForEmergencies;

        // Lee el historial de recorridos de TODAS las empresas (cada una
        // vive en historial/{companyId}) y muestra los mas recientes
        // primero, con cuantos se completaron hoy.
        function loadAndRenderHistory() {
            const list = document.getElementById('historyList');
            const todayCountEl = document.getElementById('statHistoryToday');
            if (!list) return;

            const historyRef = window.fbRef(window.fbDb, 'historial');
            window.fbGet(historyRef).then(snap => {
                const allHistory = snap.val() || {};
                const records = [];

                Object.keys(allHistory).forEach(companyId => {
                    const companyHistory = allHistory[companyId] || {};
                    const companyName = (companies[companyId] || {}).name || companyId;
                    Object.keys(companyHistory).forEach(recordId => {
                        records.push({ ...companyHistory[recordId], companyName });
                    });
                });

                records.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
                // Parte 49: guardamos el listado completo (sin el slice de
                // 30 que se usa solo para no saturar la pantalla), para que
                // exportar CSV/PDF incluya TODO el historial, no solo lo
                // que se ve en el panel.
                lastHistoryRecords = records;

                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const todayRecords = records.filter(r => (r.endTime || 0) >= startOfToday.getTime());
                if (todayCountEl) todayCountEl.textContent = todayRecords.length;

                // Parte 40: duracion promedio y km totales, calculados solo
                // sobre los recorridos de HOY (mismo recorte que "recorridos
                // hoy"), usando datos que ya guardamos al finalizar cada viaje.
                const avgDurationEl = document.getElementById('statAvgDuration');
                if (avgDurationEl) {
                    if (todayRecords.length) {
                        const avgMin = todayRecords.reduce((sum, r) => sum + (r.durationMin || 0), 0) / todayRecords.length;
                        avgDurationEl.textContent = `${Math.round(avgMin)} min`;
                    } else {
                        avgDurationEl.textContent = '—';
                    }
                }
                const kmTodayEl = document.getElementById('statKmToday');
                if (kmTodayEl) {
                    const totalKm = todayRecords.reduce((sum, r) => sum + (r.distanceKm || 0), 0);
                    kmTodayEl.textContent = totalKm.toFixed(1);
                }

                list.innerHTML = '';
                if (records.length === 0) {
                    list.innerHTML = '<div class="history-empty">Aún no hay recorridos completados.</div>';
                    return;
                }

                records.slice(0, 30).forEach(r => {
                    const sentidoLabel = r.sentido === 'retorno' ? 'Retorno' : 'Ida';
                    const when = r.endTime ? new Date(r.endTime).toLocaleString('es-PE', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                    }) : '—';
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    item.innerHTML = `
                        <div class="history-item-main">
                            <span class="history-item-plate">${escapeHtml(r.plate || r.vehicleId || '—')}</span>
                            <span class="history-item-company">${escapeHtml(r.companyName)}</span>
                        </div>
                        <div class="history-item-meta">
                            <span>${sentidoLabel}</span>
                            <span>${r.durationMin || 0} min</span>
                            <span>${r.distanceKm || 0} km</span>
                            <span>${when}</span>
                        </div>
                    `;
                    list.appendChild(item);
                });
            }).catch(err => {
                console.error('Error leyendo historial:', err);
                list.innerHTML = '<div class="history-empty">No se pudo cargar el historial.</div>';
            });
        }

        window.registerCompany = registerCompany;
        window.addVehicleToCompany = addVehicleToCompany;
        window.setRouteEditorMode = setRouteEditorMode;
        window.undoRouteEditorPoint = undoRouteEditorPoint;
        window.mirrorRouteEditorRetorno = mirrorRouteEditorRetorno;
        window.clearRouteEditor = clearRouteEditor;
        window.loadAndRenderHistory = loadAndRenderHistory;

        // ==================== EXPORTAR HISTORIAL (Parte 49) ====================
        // Reutiliza lastHistoryRecords, que ya guarda loadAndRenderHistory()
        // cada vez que se entra a la pestaña Admin — asi exportar no vuelve
        // a pedir nada a Firebase, solo formatea lo que ya esta en memoria.
        let lastHistoryRecords = [];

        function formatHistoryDateTime(ts) {
            if (!ts) return '—';
            return new Date(ts).toLocaleString('es-PE', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }

        // Escapa un valor para que sea seguro dentro de un campo CSV: si
        // contiene coma, comilla o salto de linea, lo envuelve en comillas
        // dobles (duplicando las comillas internas, regla estandar de CSV).
        function csvEscape(value) {
            const str = String(value === null || value === undefined ? '' : value);
            if (/[",\n]/.test(str)) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }

        function downloadBlob(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Pequeño delay antes de liberar el objeto URL: en algunos
            // navegadores moviles, revocarlo de inmediato corta la
            // descarga a medio camino.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        function exportHistoryCsv() {
            if (!lastHistoryRecords.length) {
                showToast('Todavía no hay historial para exportar', 'info');
                return;
            }
            const headers = ['Empresa', 'Placa', 'Conductor', 'Sentido', 'Inicio', 'Fin', 'Duración (min)', 'Distancia (km)'];
            const rows = lastHistoryRecords.map(r => [
                r.companyName || '',
                r.plate || r.vehicleId || '',
                r.driver || '',
                r.sentido === 'retorno' ? 'Retorno' : 'Ida',
                formatHistoryDateTime(r.startTime),
                formatHistoryDateTime(r.endTime),
                r.durationMin || 0,
                r.distanceKm || 0
            ]);
            // BOM (\ufeff) al inicio: sin esto, Excel en Windows interpreta
            // las tildes/ñ del CSV como caracteres raros al abrirlo.
            const csv = '\ufeff' + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
            const today = new Date().toISOString().slice(0, 10);
            downloadBlob(csv, `vura-historial-${today}.csv`, 'text/csv;charset=utf-8');
            showToast('CSV descargado', 'success');
        }

        function exportHistoryPdf() {
            if (!lastHistoryRecords.length) {
                showToast('Todavía no hay historial para exportar', 'info');
                return;
            }
            if (!window.jspdf || !window.jspdf.jsPDF) {
                showToast('No se pudo cargar el generador de PDF, revisa tu conexión', 'error');
                return;
            }
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });

            doc.setFontSize(16);
            doc.setTextColor(13, 148, 136); // var(--primary), en RGB
            doc.text('Vura · Historial de recorridos', 14, 16);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generado el ${formatHistoryDateTime(Date.now())} · ${lastHistoryRecords.length} recorridos`, 14, 22);

            doc.autoTable({
                startY: 28,
                head: [['Empresa', 'Placa', 'Conductor', 'Sentido', 'Inicio', 'Fin', 'Duración', 'Distancia']],
                body: lastHistoryRecords.map(r => [
                    r.companyName || '',
                    r.plate || r.vehicleId || '',
                    r.driver || '—',
                    r.sentido === 'retorno' ? 'Retorno' : 'Ida',
                    formatHistoryDateTime(r.startTime),
                    formatHistoryDateTime(r.endTime),
                    `${r.durationMin || 0} min`,
                    `${r.distanceKm || 0} km`
                ]),
                headStyles: { fillColor: [13, 148, 136] },
                styles: { fontSize: 8, cellPadding: 3 },
                alternateRowStyles: { fillColor: [240, 248, 247] }
            });

            const today = new Date().toISOString().slice(0, 10);
            doc.save(`vura-historial-${today}.pdf`);
            showToast('PDF descargado', 'success');
        }

        window.exportHistoryCsv = exportHistoryCsv;
        window.exportHistoryPdf = exportHistoryPdf;
