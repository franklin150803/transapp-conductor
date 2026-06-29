// admin.js
// Panel de administrador: registrar empresa nueva (con rutas generadas),
// agregar vehiculo a una empresa existente, listar vehiculos con su
// estado en linea/offline, y calcular las estadisticas (empresas,
// vehiculos, en linea) que se muestran en el dashboard. Depende de
// variables globales del script principal (companies, liveVehicles) y
// de la funcion isOnline() de map.js. Debe cargarse antes del script
// principal.

        // ==================== ADMIN VIEW ====================
        function registerCompany() {
            const name = document.getElementById('regCompanyName').value.trim();
            const ruc = document.getElementById('regCompanyRuc').value.trim();
            const phone = document.getElementById('regCompanyPhone').value.trim();
            const route = document.getElementById('regCompanyRoute').value.trim();
            const schedule = document.getElementById('regCompanySchedule').value.trim();

            if (!name || !ruc || !route) {
                showToast('Completa los campos obligatorios', 'info');
                return;
            }

            const colors = ['#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#8b5cf6'];
            const newId = 'empresa' + Date.now().toString().slice(-6);

            const baseLat = -12.0464 + (Math.random() - 0.5) * 0.1;
            const baseLng = -77.0428 + (Math.random() - 0.5) * 0.1;
            const routePointsIda = [];
            for (let i = 0; i < 6; i++) {
                routePointsIda.push([
                    baseLat + (Math.random() - 0.5) * 0.05,
                    baseLng + (Math.random() - 0.5) * 0.05
                ]);
            }
            // Retorno: la misma ruta invertida con una pequena variacion,
            // para simular que el vehiculo no vuelve por la calle exacta.
            const routePointsRetorno = [...routePointsIda].reverse().map(p => [
                p[0] + (Math.random() - 0.5) * 0.008,
                p[1] + (Math.random() - 0.5) * 0.008
            ]);

            const newCompany = {
                name, ruc, route, phone,
                schedule: schedule || null,
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
                showToast(`Empresa "${name}" registrada`, 'success');
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
        window.loadAndRenderHistory = loadAndRenderHistory;
